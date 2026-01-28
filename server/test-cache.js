/**
 * Тест модуля кэширования
 * 
 * Запуск:
 *   node server/test-cache.js
 */

import { cache } from './cache.js'

console.log('🧪 Тестирование модуля кэширования...\n')

let testsPassed = 0
let testsFailed = 0

function test(name, condition) {
  if (condition) {
    console.log(`✅ ${name}`)
    testsPassed++
  } else {
    console.log(`❌ ${name}`)
    testsFailed++
  }
}

// Тест 1: Сохранение и получение значения
console.log('Тест 1: Сохранение и получение значения')
cache.set('test_key', { data: 'test_value' }, 60)
const value = cache.get('test_key')
test('Получение сохраненного значения', value?.data === 'test_value')

// Тест 2: Проверка наличия ключа
console.log('\nТест 2: Проверка наличия ключа')
test('Ключ существует', cache.has('test_key'))
test('Несуществующий ключ', !cache.has('non_existent_key'))

// Тест 3: TTL (истечение срока действия)
console.log('\nТест 3: TTL (истечение срока действия)')
cache.set('test_ttl', { data: 'expires' }, 1) // 1 секунда
setTimeout(() => {
  const expired = cache.get('test_ttl')
  test('Значение истекло', expired === null)
  
  // Тест 4: Удаление ключа
  console.log('\nТест 4: Удаление ключа')
  cache.set('test_delete', { data: 'to_delete' }, 60)
  cache.delete('test_delete')
  test('Ключ удален', cache.get('test_delete') === null)
  
  // Тест 5: Очистка всего кэша
  console.log('\nТест 5: Очистка всего кэша')
  cache.set('test1', { data: '1' }, 60)
  cache.set('test2', { data: '2' }, 60)
  cache.clear()
  test('Кэш очищен', cache.get('test1') === null && cache.get('test2') === null)
  
  // Тест 6: Статистика
  console.log('\nТест 6: Статистика кэша')
  cache.set('stat1', { data: '1' }, 60)
  cache.set('stat2', { data: '2' }, 1) // Истечет через 1 секунду
  const stats = cache.getStats()
  test('Статистика содержит total', typeof stats.total === 'number')
  test('Статистика содержит valid', typeof stats.valid === 'number')
  test('Статистика содержит keys', Array.isArray(stats.keys))
  
  // Итоги
  console.log('\n' + '='.repeat(50))
  console.log(`✅ Тестов пройдено: ${testsPassed}`)
  console.log(`❌ Тестов провалено: ${testsFailed}`)
  console.log(`📊 Всего тестов: ${testsPassed + testsFailed}`)
  
  if (testsFailed === 0) {
    console.log('\n🎉 Все тесты пройдены успешно!')
    process.exit(0)
  } else {
    console.log('\n⚠️ Некоторые тесты провалены')
    process.exit(1)
  }
}, 2000) // Ждем 2 секунды для истечения TTL
