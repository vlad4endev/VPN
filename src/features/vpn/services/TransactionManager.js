import logger from '../../../shared/utils/logger.js'
import ThreeXUI from './ThreeXUI.js'

/**
 * Менеджер транзакций для синхронизации операций между 3x-ui и Firestore
 * Обеспечивает атомарность операций с автоматическим rollback при ошибках
 */
class TransactionManager {
  constructor(threeXUI, db) {
    this.xui = threeXUI
    this.db = db
    this.rollbackQueue = [] // Очередь для ручной обработки неудачных rollback'ов
  }

  /**
   * Транзакция добавления клиента в 3x-ui и Firestore
   * @param {string} email - Email клиента
   * @param {Object} xuiData - Данные для 3x-ui (inboundId, uuid, options)
   * @param {Object} firestoreData - Данные для Firestore
   * @returns {Promise<Object>} Результат транзакции
   */
  async addClientTransaction(email, xuiData, firestoreData) {
    const transaction = {
      xuiCreated: false,
      firestoreCreated: false,
      xuiId: null,
      firestoreId: null,
      email: email,
      timestamp: new Date().toISOString()
    }

    try {
      logger.info('Transaction', 'Начало транзакции добавления клиента', { email })

      // Шаг 1: Создаем в 3x-ui первым (это критичнее)
      logger.debug('Transaction', 'Шаг 1: Создание клиента в 3x-ui', { email })
      await this.xui.addClient(
        xuiData.inboundId,
        email,
        xuiData.uuid,
        xuiData.options || {}
      )
      transaction.xuiCreated = true
      transaction.xuiId = xuiData.uuid
      logger.info('Transaction', 'Клиент создан в 3x-ui', { email, uuid: xuiData.uuid })

      // Шаг 2: Создаем в Firestore
      logger.debug('Transaction', 'Шаг 2: Создание клиента в Firestore', { email })
      const { doc, setDoc, collection } = await import('firebase/firestore')
      const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
      const userDoc = doc(collection(this.db, `artifacts/${appId}/public/data/users_v4`))
      
      await setDoc(userDoc, {
        ...firestoreData,
        id: userDoc.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      
      transaction.firestoreCreated = true
      transaction.firestoreId = userDoc.id
      logger.info('Transaction', 'Клиент создан в Firestore', { email, docId: userDoc.id })

      logger.info('Transaction', 'Транзакция успешно завершена', { email })
      return {
        success: true,
        xuiId: transaction.xuiId,
        firestoreId: transaction.firestoreId,
        email: email
      }

    } catch (error) {
      logger.error('Transaction', 'Ошибка транзакции добавления клиента', {
        email,
        transaction,
        error: error.message
      }, error)

      // ROLLBACK
      await this.rollback(transaction, error)

      throw new Error(`Транзакция добавления клиента не удалась: ${error.message}`)
    }
  }

  /**
   * Транзакция удаления клиента из 3x-ui и Firestore
   * @param {string} email - Email клиента
   * @param {string|number} inboundId - ID инбаунда
   * @param {string} firestoreUserId - ID пользователя в Firestore
   * @returns {Promise<Object>} Результат транзакции
   */
  async deleteClientTransaction(email, inboundId, firestoreUserId) {
    const transaction = {
      xuiDeleted: false,
      firestoreDeleted: false,
      email: email,
      inboundId: inboundId,
      firestoreId: firestoreUserId,
      timestamp: new Date().toISOString()
    }

    try {
      logger.info('Transaction', 'Начало транзакции удаления клиента', { email })

      // Шаг 1: Удаляем из 3x-ui
      logger.debug('Transaction', 'Шаг 1: Удаление клиента из 3x-ui', { email })
      await this.xui.deleteClient(inboundId, email)
      transaction.xuiDeleted = true
      logger.info('Transaction', 'Клиент удален из 3x-ui', { email })

      // Шаг 2: Удаляем из Firestore
      logger.debug('Transaction', 'Шаг 2: Удаление клиента из Firestore', { email })
      const { deleteDoc, doc } = await import('firebase/firestore')
      const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
      const userDoc = doc(this.db, `artifacts/${appId}/public/data/users_v4`, firestoreUserId)
      
      await deleteDoc(userDoc)
      transaction.firestoreDeleted = true
      logger.info('Transaction', 'Клиент удален из Firestore', { email })

      logger.info('Transaction', 'Транзакция удаления успешно завершена', { email })
      return {
        success: true,
        email: email
      }

    } catch (error) {
      logger.error('Transaction', 'Ошибка транзакции удаления клиента', {
        email,
        transaction,
        error: error.message
      }, error)

      // ROLLBACK - восстанавливаем удаленное
      await this.rollbackDelete(transaction, error)

      throw new Error(`Транзакция удаления клиента не удалась: ${error.message}`)
    }
  }

  /**
   * Rollback для операции добавления
   * @private
   */
  async rollback(transaction, originalError) {
    logger.warn('Transaction', 'Начало rollback операции добавления', {
      email: transaction.email,
      transaction
    })

    // Откатываем в обратном порядке
    if (transaction.firestoreCreated) {
      try {
        const { deleteDoc, doc } = await import('firebase/firestore')
        const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
        const userDoc = doc(this.db, `artifacts/${appId}/public/data/users_v4`, transaction.firestoreId)
        await deleteDoc(userDoc)
        logger.info('Transaction', 'Rollback: документ Firestore удален', {
          email: transaction.email,
          docId: transaction.firestoreId
        })
      } catch (rollbackError) {
        logger.error('Transaction', 'Rollback не удался (Firestore)', {
          email: transaction.email,
          docId: transaction.firestoreId,
          error: rollbackError.message
        }, rollbackError)
        await this.logFailedRollback('firestore', transaction, rollbackError, originalError)
      }
    }

    if (transaction.xuiCreated) {
      try {
        await this.xui.deleteClient(transaction.inboundId || import.meta.env.VITE_XUI_INBOUND_ID, transaction.email)
        logger.info('Transaction', 'Rollback: клиент 3x-ui удален', {
          email: transaction.email
        })
      } catch (rollbackError) {
        logger.error('Transaction', 'Rollback не удался (3x-ui)', {
          email: transaction.email,
          error: rollbackError.message
        }, rollbackError)
        await this.logFailedRollback('xui', transaction, rollbackError, originalError)
      }
    }
  }

  /**
   * Rollback для операции удаления (восстановление)
   * @private
   */
  async rollbackDelete(transaction, originalError) {
    logger.warn('Transaction', 'Начало rollback операции удаления (восстановление)', {
      email: transaction.email,
      transaction
    })

    // Восстанавливаем в обратном порядке
    // ВАЖНО: Для восстановления нужны исходные данные, которые должны быть переданы в транзакцию
    // Здесь мы только логируем, так как восстановление требует исходных данных
    logger.warn('Transaction', 'Rollback удаления требует ручного вмешательства', {
      email: transaction.email,
      note: 'Исходные данные клиента должны быть восстановлены вручную'
    })

    await this.logFailedRollback('delete_rollback', transaction, originalError, originalError)
  }

  /**
   * Логирование неудачных rollback'ов для ручной обработки
   * @private
   */
  async logFailedRollback(system, transaction, rollbackError, originalError) {
    const rollbackLog = {
      timestamp: new Date().toISOString(),
      system: system, // 'firestore', 'xui', 'delete_rollback'
      email: transaction.email,
      transaction: transaction,
      rollbackError: {
        message: rollbackError.message,
        stack: rollbackError.stack
      },
      originalError: {
        message: originalError.message,
        stack: originalError.stack
      },
      status: 'pending', // pending, resolved, failed
      resolvedAt: null,
      resolvedBy: null
    }

    try {
      const { addDoc, collection } = await import('firebase/firestore')
      const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
      await addDoc(
        collection(this.db, `artifacts/${appId}/public/failed_rollbacks`),
        rollbackLog
      )
      logger.error('Transaction', 'Неудачный rollback залогирован для ручной обработки', {
        email: transaction.email,
        system: system
      })
      this.rollbackQueue.push(rollbackLog)
    } catch (logError) {
      logger.error('Transaction', 'КРИТИЧНО: Не удалось залогировать неудачный rollback', {
        email: transaction.email,
        system: system,
        logError: logError.message
      }, logError)
      // Здесь нужно отправить алерт админу (email, Slack, etc.)
      // В production это должно быть реализовано
    }
  }

  /**
   * Получение списка неудачных rollback'ов для ручной обработки
   * @returns {Promise<Array>} Список pending rollback'ов
   */
  async getFailedRollbacks() {
    try {
      const { getDocs, query, collection, where } = await import('firebase/firestore')
      const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
      const snapshot = await getDocs(
        query(
          collection(this.db, `artifacts/${appId}/public/failed_rollbacks`),
          where('status', '==', 'pending')
        )
      )

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    } catch (error) {
      logger.error('Transaction', 'Ошибка получения списка failed rollbacks', null, error)
      throw error
    }
  }

  /**
   * Отметка rollback как обработанного
   * @param {string} rollbackId - ID rollback записи
   * @param {string} resolvedBy - ID пользователя, который обработал
   * @returns {Promise<void>}
   */
  async markRollbackResolved(rollbackId, resolvedBy) {
    try {
      const { updateDoc, doc } = await import('firebase/firestore')
      const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default'
      const rollbackDoc = doc(this.db, `artifacts/${appId}/public/failed_rollbacks`, rollbackId)
      
      await updateDoc(rollbackDoc, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolvedBy
      })

      logger.info('Transaction', 'Rollback отмечен как обработанный', {
        rollbackId,
        resolvedBy
      })
    } catch (error) {
      logger.error('Transaction', 'Ошибка обновления статуса rollback', {
        rollbackId,
        error: error.message
      }, error)
      throw error
    }
  }
}

// Экспортируем класс для создания инстанса с нужными зависимостями
export default TransactionManager

