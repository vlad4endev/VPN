import { useState, useCallback, useRef } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config.js'
import { APP_ID } from '../../../shared/constants/app.js'
import axios from 'axios'
import logger from '../../../shared/utils/logger.js'

/**
 * Custom hook для управления серверами (только для админа)
 * 
 * @param {Object} currentUser - Текущий пользователь (должен быть админом)
 * @param {Array} servers - Список серверов
 * @param {Function} setServers - Функция для обновления списка серверов
 * @param {Object} settings - Настройки
 * @param {Function} setSettings - Функция для обновления настроек
 * @param {Function} setError - Функция для установки ошибки
 * @param {Function} setSuccess - Функция для установки сообщения об успехе
 * @returns {Object} Объект с состоянием и методами для работы с серверами
 */
export function useServers(currentUser, servers, setServers, settings, setSettings, setError, setSuccess) {
  const [editingServer, setEditingServer] = useState(null)
  const [testingServerId, setTestingServerId] = useState(null)
  const newServerIdRef = useRef(null)

  // Добавление нового сервера
  const handleAddServer = useCallback(() => {
    // Генерируем стабильный ID для нового сервера один раз
    if (!newServerIdRef.current) {
      newServerIdRef.current = `new-server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }
    const newServer = {
      id: newServerIdRef.current,
      name: '',
      serverIP: '',
      serverPort: 2053,
      protocol: 'http',
      randompath: '',
      xuiUsername: '',
      xuiPassword: '',
      xuiInboundId: '',
      tariffIds: [],
      location: '',
      active: true,
      sessionTested: false,
      sessionTestedAt: null,
    }
    setEditingServer(newServer)
  }, [])

  // Сохранение сервера
  const handleSaveServer = useCallback(async () => {
    if (!editingServer) return
    
    // Проверка прав доступа
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав для сохранения сервера')
      logger.warn('Admin', 'Попытка сохранения сервера без прав администратора', { userId: currentUser?.id })
      return
    }
    
    // Обрезаем пробелы в текстовых полях перед сохранением
    const explicitProtocol = editingServer.protocol && editingServer.protocol.trim() !== ''
    const protocol = explicitProtocol 
      ? editingServer.protocol.trim() 
      : (editingServer.serverPort === 443 || editingServer.serverPort === 40919 ? 'https' : 'http')
    
    const cleanUsername = (editingServer.xuiUsername || '').trim().replace(/^["']|["']$/g, '')
    
    const cleanedServer = {
      ...editingServer,
      name: (editingServer.name || '').trim(),
      serverIP: (editingServer.serverIP || '').trim(),
      protocol: protocol,
      xuiUsername: cleanUsername,
      xuiPassword: editingServer.xuiPassword || '',
      xuiInboundId: (editingServer.xuiInboundId || '').trim(),
      location: (editingServer.location || '').trim(),
      randompath: (editingServer.randompath || '').trim(),
    }
    
    // Валидация
    if (!cleanedServer.name || !cleanedServer.serverIP || !cleanedServer.serverPort) {
      setError('Заполните обязательные поля: название, IP и порт')
      return
    }

    if (!cleanedServer.xuiUsername || !cleanedServer.xuiPassword || !cleanedServer.xuiInboundId) {
      setError('Заполните обязательные поля: имя пользователя, пароль и ID инбаунда')
      return
    }

    if (!db) {
      setError('База данных недоступна')
      return
    }

    try {
      const isUpdate = cleanedServer.id && servers.find(s => s.id === cleanedServer.id)
      let updatedServers = []
      
      if (isUpdate) {
        updatedServers = servers.map(s => s.id === cleanedServer.id ? cleanedServer : s)
      } else {
        updatedServers = [...servers, cleanedServer]
      }
      
      setServers(updatedServers)
      
      const currentSettings = settings || {
        serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
        serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
        xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
        xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
        xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
        servers: [],
      }
      
      const updatedSettings = {
        ...currentSettings,
        servers: updatedServers,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.id,
      }
      
      setSettings(updatedSettings)
      
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsDoc, updatedSettings, { merge: true })
      
      newServerIdRef.current = null
      setEditingServer(null)
      setSuccess('Сервер сохранен')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      logger.error('Admin', 'Ошибка сохранения сервера в Firestore', { adminId: currentUser.id }, err)
      setError('Ошибка сохранения сервера: ' + (err.message || 'Неизвестная ошибка'))
    }
  }, [editingServer, currentUser, db, settings, servers, setServers, setSettings, setError, setSuccess])

  // Удаление сервера
  const handleDeleteServer = useCallback(async (serverId) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Недостаточно прав для удаления сервера')
      return
    }
    
    if (!window.confirm('Вы уверены, что хотите удалить этот сервер?')) {
      return
    }
    
    if (!db) {
      setError('База данных недоступна')
      return
    }

    try {
      const updatedServers = servers.filter(s => s.id !== serverId)
      setServers(updatedServers)
      
      const currentSettings = settings || {
        serverIP: import.meta.env.VITE_XUI_HOST || 'http://localhost',
        serverPort: Number(import.meta.env.VITE_XUI_PORT) || 2053,
        xuiUsername: import.meta.env.VITE_XUI_USERNAME || '',
        xuiPassword: import.meta.env.VITE_XUI_PASSWORD || '',
        xuiInboundId: import.meta.env.VITE_XUI_INBOUND_ID || '',
        servers: [],
      }
      
      const updatedSettings = {
        ...currentSettings,
        servers: updatedServers,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.id,
      }
      
      setSettings(updatedSettings)
      
      const settingsDoc = doc(db, `artifacts/${APP_ID}/public/settings`)
      await setDoc(settingsDoc, updatedSettings, { merge: true })
      
      setSuccess('Сервер удален')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      logger.error('Admin', 'Ошибка удаления сервера из Firestore', { adminId: currentUser.id }, err)
      setError('Ошибка удаления сервера: ' + (err.message || 'Неизвестная ошибка'))
      setServers(servers) // Восстанавливаем при ошибке
    }
  }, [servers, currentUser, db, settings, setServers, setSettings, setError, setSuccess])

  // Тестирование сессии сервера
  const handleTestServerSession = useCallback(async (server) => {
    if (!server || !server.id) return
    
    setTestingServerId(server.id)
    setError('')
    setSuccess('')

    const currentServer = servers.find(s => s.id === server.id) || server
    
    const protocol = currentServer.protocol || (currentServer.serverPort === 443 || currentServer.serverPort === 40919 ? 'https' : 'http')
    const normalizedPath = currentServer.randompath 
      ? `/${currentServer.randompath.replace(/^\/+|\/+$/g, '')}` 
      : ''
    const baseURL = `${protocol}://${currentServer.serverIP}:${currentServer.serverPort}${normalizedPath}`.replace(/\/+$/, '')
    const loginURL = `${baseURL}/login`

    try {
      const username = (currentServer.xuiUsername || '').trim().replace(/^["']|["']$/g, '')
      const password = currentServer.xuiPassword || ''
      
      if (!username || !password) {
        const missingFields = []
        if (!username) missingFields.push('Username')
        if (!password) missingFields.push('Password')
        
        throw new Error(`Отсутствуют обязательные поля для авторизации: ${missingFields.join(', ')}`)
      }
      
      const requestPayload = {
        serverIP: server.serverIP,
        serverPort: server.serverPort,
        protocol: protocol,
        randompath: server.randompath || '',
        username: username,
        password: password,
      }
      
      const response = await axios.post('/api/test-session', requestPayload, {
        withCredentials: true,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })

      const data = response.data || {}
      let sessionCookie = null
      const setCookieHeader = response.headers['set-cookie'] || response.headers['Set-Cookie']
      
      if (setCookieHeader) {
        const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
        for (const cookieString of cookieArray) {
          if (cookieString.includes('3x-ui=')) {
            const cookieMatch = cookieString.match(/3x-ui=([^;]+)/)
            if (cookieMatch) {
              sessionCookie = cookieMatch[1]
              break
            }
          }
        }
      }

      // Обновляем сервер с результатами теста
      const updatedServers = servers.map(s => 
        s.id === server.id 
          ? {
              ...s,
              sessionTested: true,
              sessionTestedAt: new Date().toISOString(),
              sessionError: null,
              sessionCookie: sessionCookie,
            }
          : s
      )
      setServers(updatedServers)
      
      setSuccess('Сессия успешно протестирована')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Admin', 'Ошибка тестирования сессии', { serverId: server.id }, err)
      
      // Обновляем сервер с ошибкой
      const updatedServers = servers.map(s => 
        s.id === server.id 
          ? {
              ...s,
              sessionTested: false,
              sessionTestedAt: new Date().toISOString(),
              sessionError: err.message || 'Ошибка тестирования сессии',
            }
          : s
      )
      setServers(updatedServers)
      
      setError(err.message || 'Ошибка тестирования сессии')
    } finally {
      setTestingServerId(null)
    }
  }, [servers, setServers, setError, setSuccess])

  // Обработчики для полей сервера
  const handleServerNameChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, name: value } : null)
  }, [])

  const handleServerIPChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, serverIP: value } : null)
  }, [])

  const handleServerPortChange = useCallback((e) => {
    const value = Number(e.target.value) || 2053
    setEditingServer(prev => prev ? { ...prev, serverPort: value } : null)
  }, [])

  const handleServerProtocolChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, protocol: value } : null)
  }, [])

  const handleServerRandompathChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, randompath: value } : null)
  }, [])

  const handleServerXuiUsernameChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, xuiUsername: value } : null)
  }, [])

  const handleServerXuiPasswordChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, xuiPassword: value } : null)
  }, [])

  const handleServerXuiInboundIdChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, xuiInboundId: value } : null)
  }, [])

  const handleServerLocationChange = useCallback((e) => {
    const value = e.target.value
    setEditingServer(prev => prev ? { ...prev, location: value } : null)
  }, [])

  const handleServerActiveChange = useCallback((e) => {
    const value = e.target.checked
    setEditingServer(prev => prev ? { ...prev, active: value } : null)
  }, [])

  const handleServerTariffChange = useCallback((tariffId, checked) => {
    setEditingServer(prev => {
      if (!prev) return null
      const currentIds = prev.tariffIds || []
      const newIds = checked
        ? [...currentIds, tariffId]
        : currentIds.filter(id => id !== tariffId)
      return { ...prev, tariffIds: newIds }
    })
  }, [])

  return {
    editingServer,
    testingServerId,
    setEditingServer,
    handleAddServer,
    handleSaveServer,
    handleDeleteServer,
    handleTestServerSession,
    handleServerNameChange,
    handleServerIPChange,
    handleServerPortChange,
    handleServerProtocolChange,
    handleServerRandompathChange,
    handleServerXuiUsernameChange,
    handleServerXuiPasswordChange,
    handleServerXuiInboundIdChange,
    handleServerLocationChange,
    handleServerActiveChange,
    handleServerTariffChange,
  }
}
