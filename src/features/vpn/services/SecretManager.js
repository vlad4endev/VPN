import logger from '../../../shared/utils/logger.js'

/**
 * Менеджер секретов для безопасного хранения credentials
 * Поддерживает разные источники: переменные окружения, AWS Secrets Manager, Azure Key Vault
 */
class SecretManager {
  constructor() {
    this.credentials = null
    this.initialized = false
  }

  /**
   * Инициализация и загрузка credentials
   * @param {Object} options - Опции инициализации
   * @param {string} options.source - Источник: 'env', 'aws', 'azure', 'file'
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    if (this.initialized) {
      logger.debug('SecretManager', 'Уже инициализирован')
      return
    }

    const source = options.source || this.detectSource()

    try {
      switch (source) {
        case 'aws':
          await this.loadFromAWS(options)
          break
        case 'azure':
          await this.loadFromAzure(options)
          break
        case 'file':
          await this.loadFromFile(options)
          break
        case 'env':
        default:
          this.loadFromEnv()
          break
      }

      this.validateCredentials()
      this.initialized = true
      logger.info('SecretManager', 'Credentials загружены', {
        source: source,
        hasUsername: !!this.credentials.username,
        hasPassword: !!this.credentials.password,
        hasHost: !!this.credentials.host
      })
    } catch (error) {
      logger.error('SecretManager', 'Ошибка загрузки credentials', {
        source: source,
        error: error.message
      }, error)
      throw error
    }
  }

  /**
   * Автоматическое определение источника credentials
   * @private
   */
  detectSource() {
    // Проверяем наличие переменных окружения для cloud сервисов
    if (process.env.AWS_SECRETS_MANAGER_SECRET_ID || process.env.AWS_REGION) {
      return 'aws'
    }
    if (process.env.AZURE_KEY_VAULT_NAME) {
      return 'azure'
    }
    if (process.env.SECRETS_FILE_PATH) {
      return 'file'
    }
    // По умолчанию - переменные окружения
    return 'env'
  }

  /**
   * Загрузка из переменных окружения
   * @private
   */
  loadFromEnv() {
    // Для браузера используем import.meta.env
    // Для Node.js используем process.env
    const env = typeof window !== 'undefined' 
      ? import.meta.env 
      : process.env

    this.credentials = {
      username: env.VITE_XUI_USERNAME || env.XUI_USERNAME,
      password: env.VITE_XUI_PASSWORD || env.XUI_PASSWORD,
      host: env.XUI_HOST,
      inboundId: env.VITE_XUI_INBOUND_ID || env.XUI_INBOUND_ID
    }
  }

  /**
   * Загрузка из AWS Secrets Manager
   * @private
   */
  async loadFromAWS(options = {}) {
    try {
      // Динамический импорт для Node.js окружения
      const AWS = await import('aws-sdk').catch(() => null)
      
      if (!AWS) {
        throw new Error('aws-sdk не установлен. Установите: npm install aws-sdk')
      }

      const secretsManager = new AWS.SecretsManager({
        region: options.region || process.env.AWS_REGION || 'us-east-1'
      })

      const secretId = options.secretId || process.env.AWS_SECRETS_MANAGER_SECRET_ID || 'xui-credentials'
      
      const data = await secretsManager.getSecretValue({ SecretId: secretId }).promise()
      const secrets = JSON.parse(data.SecretString)

      this.credentials = {
        username: secrets.username || secrets.XUI_USERNAME,
        password: secrets.password || secrets.XUI_PASSWORD,
        host: secrets.host || secrets.XUI_HOST,
        inboundId: secrets.inboundId || secrets.XUI_INBOUND_ID
      }

      logger.info('SecretManager', 'Credentials загружены из AWS Secrets Manager', {
        secretId: secretId,
        region: options.region
      })
    } catch (error) {
      logger.error('SecretManager', 'Ошибка загрузки из AWS Secrets Manager', null, error)
      throw new Error(`Не удалось загрузить credentials из AWS: ${error.message}`)
    }
  }

  /**
   * Загрузка из Azure Key Vault
   * @private
   */
  async loadFromAzure(options = {}) {
    try {
      // Динамический импорт для Node.js окружения
      const { SecretClient } = await import('@azure/keyvault-secrets').catch(() => null)
      const { DefaultAzureCredential } = await import('@azure/identity').catch(() => null)

      if (!SecretClient || !DefaultAzureCredential) {
        throw new Error('Azure SDK не установлен. Установите: npm install @azure/keyvault-secrets @azure/identity')
      }

      const vaultUrl = options.vaultUrl || process.env.AZURE_KEY_VAULT_URL
      if (!vaultUrl) {
        throw new Error('AZURE_KEY_VAULT_URL не установлен')
      }

      const credential = new DefaultAzureCredential()
      const client = new SecretClient(vaultUrl, credential)

      const [username, password, host, inboundId] = await Promise.all([
        client.getSecret('xui-username'),
        client.getSecret('xui-password'),
        client.getSecret('xui-host'),
        client.getSecret('xui-inbound-id').catch(() => ({ value: null }))
      ])

      this.credentials = {
        username: username.value,
        password: password.value,
        host: host.value,
        inboundId: inboundId.value
      }

      logger.info('SecretManager', 'Credentials загружены из Azure Key Vault', {
        vaultUrl: vaultUrl
      })
    } catch (error) {
      logger.error('SecretManager', 'Ошибка загрузки из Azure Key Vault', null, error)
      throw new Error(`Не удалось загрузить credentials из Azure: ${error.message}`)
    }
  }

  /**
   * Загрузка из файла (для локальной разработки)
   * @private
   */
  async loadFromFile(options = {}) {
    try {
      const fs = await import('fs').then(m => m.promises).catch(() => null)
      const path = options.filePath || process.env.SECRETS_FILE_PATH || '.env.local'

      if (!fs) {
        throw new Error('fs модуль недоступен (браузерное окружение)')
      }

      const fileContent = await fs.readFile(path, 'utf-8')
      const secrets = {}

      // Парсим .env формат
      fileContent.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0) {
            secrets[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
          }
        }
      })

      this.credentials = {
        username: secrets.VITE_XUI_USERNAME || secrets.XUI_USERNAME,
        password: secrets.VITE_XUI_PASSWORD || secrets.XUI_PASSWORD,
        host: secrets.XUI_HOST,
        inboundId: secrets.VITE_XUI_INBOUND_ID || secrets.XUI_INBOUND_ID
      }

      logger.info('SecretManager', 'Credentials загружены из файла', {
        filePath: path
      })
    } catch (error) {
      logger.error('SecretManager', 'Ошибка загрузки из файла', null, error)
      throw new Error(`Не удалось загрузить credentials из файла: ${error.message}`)
    }
  }

  /**
   * Валидация credentials
   * @private
   */
  validateCredentials() {
    const missing = []

    if (!this.credentials.username) missing.push('username')
    if (!this.credentials.password) missing.push('password')
    if (!this.credentials.host) missing.push('host')

    if (missing.length > 0) {
      throw new Error(`Отсутствуют обязательные credentials: ${missing.join(', ')}`)
    }
  }

  /**
   * Получение credentials (копия для безопасности)
   * @returns {Object} Объект с credentials
   */
  get() {
    if (!this.initialized) {
      throw new Error('SecretManager не инициализирован. Вызовите initialize() сначала.')
    }

    // Возвращаем копию для безопасности
    return {
      username: this.credentials.username,
      password: this.credentials.password,
      host: this.credentials.host,
      inboundId: this.credentials.inboundId
    }
  }

  /**
   * Получение конкретного credential
   * @param {string} key - Ключ: 'username', 'password', 'host', 'inboundId'
   * @returns {string|null}
   */
  getCredential(key) {
    if (!this.initialized) {
      throw new Error('SecretManager не инициализирован. Вызовите initialize() сначала.')
    }

    return this.credentials[key] || null
  }
}

// Экспортируем singleton экземпляр
const secretManager = new SecretManager()

// Автоматическая инициализация при импорте (только для браузера)
if (typeof window !== 'undefined') {
  secretManager.initialize().catch(err => {
    console.error('Failed to initialize SecretManager:', err)
  })
}

export default secretManager

