/**
 * Cluster Mode Wrapper для Node.js
 * 
 * Автоматически запускает приложение в cluster mode для использования
 * всех доступных CPU ядер. Это значительно повышает производительность
 * и отзывчивость сервера под нагрузкой.
 * 
 * Использование:
 *   import cluster from 'cluster'
 *   import { startCluster } from './cluster.js'
 *   
 *   startCluster(() => {
 *     // Ваш код сервера здесь
 *     import('./proxy-server.js')
 *   })
 * 
 * Или в proxy-server.js:
 *   import { startCluster } from './cluster.js'
 *   
 *   startCluster(async () => {
 *     const app = await createApp()
 *     app.listen(PORT)
 *   })
 */

import cluster from 'cluster'
import os from 'os'

/**
 * Запустить приложение в cluster mode
 * @param {Function} workerCallback - Функция, которая запускает worker процесс
 * @param {Object} options - Опции конфигурации
 * @param {number} options.workers - Количество worker процессов (по умолчанию: количество CPU ядер)
 * @param {boolean} options.enableCluster - Включить cluster mode (по умолчанию: true в production)
 */
export function startCluster(workerCallback, options = {}) {
  const {
    workers = os.cpus().length,
    enableCluster = process.env.NODE_ENV === 'production'
  } = options

  // Если cluster mode отключен или мы уже в worker процессе, просто запускаем callback
  if (!enableCluster || cluster.isWorker) {
    return workerCallback()
  }

  // Master процесс - создаем workers
  console.log(`🚀 Starting cluster mode with ${workers} workers`)
  console.log(`📊 CPU cores: ${os.cpus().length}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`)

  // Создаем worker процессы
  for (let i = 0; i < workers; i++) {
    const worker = cluster.fork()
    console.log(`✅ Worker ${worker.process.pid} started`)
  }

  // Обработка выхода worker процесса
  cluster.on('exit', (worker, code, signal) => {
    console.error(`❌ Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`)
    console.log('🔄 Starting a new worker...')
    
    // Автоматически перезапускаем упавший worker
    const newWorker = cluster.fork()
    console.log(`✅ New worker ${newWorker.process.pid} started`)
  })

  // Обработка сообщений от workers (для логирования)
  cluster.on('message', (worker, message) => {
    if (message.type === 'log') {
      console.log(`[Worker ${worker.process.pid}] ${message.data}`)
    }
  })

  // Graceful shutdown для всех workers
  const shutdown = () => {
    console.log('\n🛑 Shutting down cluster...')
    
    // Отключаем прием новых соединений
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM')
    }
    
    // Ждем завершения всех workers
    setTimeout(() => {
      console.log('✅ All workers stopped')
      process.exit(0)
    }, 5000)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Обработка ошибок master процесса
  cluster.on('error', (err) => {
    console.error('❌ Cluster error:', err)
  })

  return null
}

/**
 * Получить информацию о текущем worker
 * @returns {Object} Информация о worker
 */
export function getWorkerInfo() {
  if (cluster.isWorker) {
    return {
      isWorker: true,
      workerId: cluster.worker.id,
      processId: process.pid
    }
  }
  return {
    isWorker: false,
    isMaster: cluster.isMaster,
    workersCount: Object.keys(cluster.workers || {}).length
  }
}

export default { startCluster, getWorkerInfo }
