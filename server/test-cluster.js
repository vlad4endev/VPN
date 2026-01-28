/**
 * Тест cluster mode
 * 
 * Запуск:
 *   node server/test-cluster.js
 * 
 * Ожидаемое поведение:
 * - Должны увидеть сообщения о запуске workers
 * - Количество workers = количество CPU ядер
 */

import { startCluster, getWorkerInfo } from './cluster.js'
import os from 'os'

console.log('🧪 Тестирование cluster mode...\n')
console.log(`📊 CPU ядер: ${os.cpus().length}`)
console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'development'}\n`)

startCluster(() => {
  const info = getWorkerInfo()
  console.log('📋 Информация о worker:')
  console.log(JSON.stringify(info, null, 2))
  
  if (info.isWorker) {
    console.log(`\n✅ Worker ${info.workerId} запущен (PID: ${info.processId})`)
  } else {
    console.log(`\n✅ Master процесс запущен`)
    console.log(`📊 Количество workers: ${info.workersCount || 0}`)
  }
  
  console.log('\n✅ Cluster mode работает корректно!')
  console.log('💡 Для остановки нажмите Ctrl+C\n')
  
  // Завершаем через 5 секунд для автоматического теста
  setTimeout(() => {
    console.log('\n🛑 Завершение теста...')
    process.exit(0)
  }, 5000)
}, {
  enableCluster: true, // Принудительно включаем для теста
  workers: 2 // Используем 2 workers для теста
})
