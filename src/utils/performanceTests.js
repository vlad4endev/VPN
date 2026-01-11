/**
 * Утилиты для тестирования производительности
 * Используйте эти функции для измерения и сравнения производительности
 */

/**
 * Измеряет время выполнения функции
 * @param {string} label - Метка для логирования
 * @param {Function} fn - Функция для измерения
 * @returns {number} Время выполнения в миллисекундах
 */
export const measureExecutionTime = (label, fn) => {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  const duration = end - start
  
  console.log(`⏱️ [${label}] Execution time: ${duration.toFixed(2)}ms`)
  return { duration, result }
}

/**
 * Запускает функцию несколько раз и вычисляет среднее время
 * @param {string} label - Метка для логирования
 * @param {Function} fn - Функция для измерения
 * @param {number} iterations - Количество итераций (по умолчанию 10)
 * @returns {Object} Статистика выполнения
 */
export const measureAverageExecutionTime = (label, fn, iterations = 10) => {
  const times = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    const end = performance.now()
    times.push(end - start)
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / iterations
  const min = Math.min(...times)
  const max = Math.max(...times)
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
  
  console.log(`📊 [${label}] Performance Statistics:`)
  console.log(`  Average: ${avg.toFixed(2)}ms`)
  console.log(`  Min: ${min.toFixed(2)}ms`)
  console.log(`  Max: ${max.toFixed(2)}ms`)
  console.log(`  Median: ${median.toFixed(2)}ms`)
  
  return { avg, min, max, median, times }
}

/**
 * Измеряет FPS (кадров в секунду) при скролле
 * @param {HTMLElement} element - Элемент для отслеживания скролла
 * @param {Function} callback - Колбэк, вызываемый с текущим FPS
 * @returns {Function} Функция для остановки измерения
 */
export const measureScrollFPS = (element, callback) => {
  let frameCount = 0
  let lastTime = performance.now()
  let rafId = null
  
  const measure = () => {
    frameCount++
    const currentTime = performance.now()
    
    if (currentTime >= lastTime + 1000) {
      const fps = frameCount
      frameCount = 0
      lastTime = currentTime
      
      callback(fps)
      
      if (fps < 30) {
        console.warn(`⚠️ Low FPS detected: ${fps} FPS. Consider optimization.`)
      }
    }
    
    rafId = requestAnimationFrame(measure)
  }
  
  rafId = requestAnimationFrame(measure)
  
  return () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
    }
  }
}

/**
 * Измеряет использование памяти
 * @returns {Object} Информация об использовании памяти
 */
export const measureMemory = () => {
  if (!performance.memory) {
    console.warn('Memory API not available in this browser')
    return null
  }
  
  const memory = performance.memory
  const memoryInfo = {
    used: (memory.usedJSHeapSize / 1048576).toFixed(2), // MB
    total: (memory.totalJSHeapSize / 1048576).toFixed(2), // MB
    limit: (memory.jsHeapSizeLimit / 1048576).toFixed(2), // MB
  }
  
  console.log('💾 Memory Usage:')
  console.log(`  Used: ${memoryInfo.used} MB`)
  console.log(`  Total: ${memoryInfo.total} MB`)
  console.log(`  Limit: ${memoryInfo.limit} MB`)
  
  return memoryInfo
}

/**
 * Сравнивает производительность двух функций
 * @param {string} label1 - Метка первой функции
 * @param {Function} fn1 - Первая функция
 * @param {string} label2 - Метка второй функции
 * @param {Function} fn2 - Вторая функция
 * @param {number} iterations - Количество итераций
 */
export const comparePerformance = (label1, fn1, label2, fn2, iterations = 10) => {
  console.log(`\n🔬 Comparing: "${label1}" vs "${label2}"\n`)
  
  const stats1 = measureAverageExecutionTime(label1, fn1, iterations)
  const stats2 = measureAverageExecutionTime(label2, fn2, iterations)
  
  const improvement = ((stats1.avg - stats2.avg) / stats1.avg * 100).toFixed(1)
  const faster = stats1.avg > stats2.avg ? label2 : label1
  const speedup = (Math.max(stats1.avg, stats2.avg) / Math.min(stats1.avg, stats2.avg)).toFixed(2)
  
  console.log(`\n📈 Comparison Results:`)
  console.log(`  ${faster} is faster by ${Math.abs(improvement)}%`)
  console.log(`  Speedup: ${speedup}x`)
  
  return {
    stats1,
    stats2,
    improvement: parseFloat(improvement),
    faster,
    speedup: parseFloat(speedup),
  }
}

/**
 * Измеряет время первого рендера компонента
 * @param {string} componentName - Имя компонента
 * @param {Function} renderFn - Функция рендера
 */
export const measureFirstRender = (componentName, renderFn) => {
  const start = performance.now()
  renderFn()
  const end = performance.now()
  const duration = end - start
  
  console.log(`🎨 [${componentName}] First render: ${duration.toFixed(2)}ms`)
  
  return duration
}

/**
 * Измеряет количество DOM-узлов
 * @param {HTMLElement} container - Контейнер для подсчета
 * @returns {number} Количество DOM-узлов
 */
export const countDOMNodes = (container) => {
  if (!container) return 0
  
  const count = container.querySelectorAll('*').length
  console.log(`🌳 DOM Nodes: ${count}`)
  
  return count
}

/**
 * Создает отчет о производительности
 * @param {Object} metrics - Метрики производительности
 */
export const generatePerformanceReport = (metrics) => {
  console.log('\n📋 Performance Report')
  console.log('='.repeat(50))
  
  if (metrics.renderTime) {
    console.log(`Render Time: ${metrics.renderTime.toFixed(2)}ms`)
  }
  
  if (metrics.domNodes) {
    console.log(`DOM Nodes: ${metrics.domNodes}`)
  }
  
  if (metrics.memory) {
    console.log(`Memory Used: ${metrics.memory.used} MB`)
  }
  
  if (metrics.fps) {
    console.log(`Average FPS: ${metrics.fps}`)
  }
  
  console.log('='.repeat(50))
}

/**
 * Хук для измерения производительности React компонента
 * Используйте в компоненте:
 * 
 * useEffect(() => {
 *   const start = performance.now()
 *   return () => {
 *     const end = performance.now()
 *     console.log(`Component render time: ${end - start}ms`)
 *   }
 * })
 */
export const usePerformanceMeasure = (componentName) => {
  if (typeof window === 'undefined') return
  
  const start = performance.now()
  
  return () => {
    const end = performance.now()
    console.log(`⏱️ [${componentName}] Render time: ${(end - start).toFixed(2)}ms`)
  }
}

/**
 * Генерирует тестовые данные для производительности
 * @param {number} count - Количество элементов
 * @returns {Array} Массив тестовых данных
 */
export const generateTestUsers = (count = 1000) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    email: `user${i}@example.com`,
    uuid: `uuid-${i}-${Math.random().toString(36).substr(2, 9)}`,
    role: i % 10 === 0 ? 'admin' : 'user',
    plan: i % 3 === 0 ? 'premium' : 'free',
    devices: Math.floor(Math.random() * 5) + 1,
    expiresAt: Date.now() + (Math.random() * 30 * 24 * 60 * 60 * 1000),
  }))
}

/**
 * Тест производительности скролла
 * @param {HTMLElement} container - Контейнер для скролла
 * @param {number} duration - Длительность теста в секундах
 */
export const testScrollPerformance = (container, duration = 5) => {
  if (!container) {
    console.error('Container element not found')
    return
  }
  
  const fpsValues = []
  let frameCount = 0
  let lastTime = performance.now()
  let rafId = null
  
  const measure = () => {
    frameCount++
    const currentTime = performance.now()
    
    if (currentTime >= lastTime + 1000) {
      fpsValues.push(frameCount)
      frameCount = 0
      lastTime = currentTime
    }
    
    rafId = requestAnimationFrame(measure)
  }
  
  // Начинаем измерение
  rafId = requestAnimationFrame(measure)
  
  // Автоматический скролл
  const scrollInterval = setInterval(() => {
    container.scrollTop += 10
    if (container.scrollTop >= container.scrollHeight - container.clientHeight) {
      container.scrollTop = 0
    }
  }, 16) // ~60 FPS
  
  // Останавливаем через duration секунд
  setTimeout(() => {
    clearInterval(scrollInterval)
    if (rafId) {
      cancelAnimationFrame(rafId)
    }
    
    const avgFPS = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length
    const minFPS = Math.min(...fpsValues)
    const maxFPS = Math.max(...fpsValues)
    
    console.log('🎮 Scroll Performance Test Results:')
    console.log(`  Average FPS: ${avgFPS.toFixed(2)}`)
    console.log(`  Min FPS: ${minFPS}`)
    console.log(`  Max FPS: ${maxFPS}`)
    
    if (avgFPS < 30) {
      console.warn('⚠️ Poor scroll performance detected!')
    } else if (avgFPS >= 55) {
      console.log('✅ Excellent scroll performance!')
    }
  }, duration * 1000)
}

