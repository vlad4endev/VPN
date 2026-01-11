import { useState, useEffect, useRef } from 'react'
import { FixedSizeList } from 'react-window'
import { generateTestUsers, measureMemory, comparePerformance } from '../../../utils/performanceTests.js'
import VirtualizedUserTable from './VirtualizedUserTable.jsx'

/**
 * Компонент для сравнения производительности
 * виртуализированного и обычного списка
 */
const PerformanceComparison = () => {
  const [users] = useState(() => generateTestUsers(1000))
  const [useVirtualization, setUseVirtualization] = useState(true)
  const [renderTime, setRenderTime] = useState(0)
  const [domNodes, setDomNodes] = useState(0)
  const [memoryBefore, setMemoryBefore] = useState(null)
  const [memoryAfter, setMemoryAfter] = useState(null)
  const containerRef = useRef(null)

  // Измеряем производительность при переключении режима
  useEffect(() => {
    // Измеряем память до рендера
    const memBefore = measureMemory()
    setMemoryBefore(memBefore)

    // Измеряем время рендера
    const start = performance.now()
    
    // Симулируем рендер (React рендерит асинхронно)
    requestAnimationFrame(() => {
      const end = performance.now()
      setRenderTime(end - start)

      // Измеряем память после рендера
      setTimeout(() => {
        const memAfter = measureMemory()
        setMemoryAfter(memAfter)

        // Подсчитываем DOM-узлы
        if (containerRef.current) {
          const nodes = containerRef.current.querySelectorAll('*').length
          setDomNodes(nodes)
        }
      }, 100)
    })
  }, [useVirtualization, users])

  // Обычный список (без виртуализации)
  const renderNormalList = () => {
    return (
      <div
        ref={containerRef}
        className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 overflow-hidden"
        style={{ height: '600px', overflowY: 'auto' }}
      >
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-slate-200">Обычный список</h2>
          <p className="text-slate-400 text-sm mt-1">
            Всего пользователей: {users.length}
          </p>
        </div>

        {/* Заголовок */}
        <div className="bg-slate-800 grid grid-cols-8 gap-4 px-6 py-3 border-b border-slate-700">
          <div className="text-xs font-medium text-slate-300 uppercase">Email</div>
          <div className="text-xs font-medium text-slate-300 uppercase">UUID</div>
          <div className="text-xs font-medium text-slate-300 uppercase">Роль</div>
          <div className="text-xs font-medium text-slate-300 uppercase">План</div>
          <div className="text-xs font-medium text-slate-300 uppercase">Устройства</div>
          <div className="text-xs font-medium text-slate-300 uppercase">Статус</div>
          <div className="text-xs font-medium text-slate-300 uppercase">Истекает</div>
          <div className="text-xs font-medium text-slate-300 uppercase">Действия</div>
        </div>

        {/* Список */}
        <div>
          {users.map((user) => (
            <div
              key={user.id}
              className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
            >
              <div className="grid grid-cols-8 gap-4 px-6 py-4 items-center min-h-[80px]">
                <div className="text-slate-200 truncate">{user.email}</div>
                <div className="text-slate-400 font-mono text-xs truncate">{user.uuid}</div>
                <div className="text-slate-200">{user.role}</div>
                <div className="text-slate-200">{user.plan}</div>
                <div className="text-slate-200">{user.devices}</div>
                <div className="text-slate-200">Active</div>
                <div className="text-slate-400 text-sm">
                  {new Date(user.expiresAt).toLocaleDateString()}
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Виртуализированный список
  const renderVirtualizedList = () => {
    return (
      <div ref={containerRef}>
        <VirtualizedUserTable
          users={users}
          editingUser={null}
          onSetEditingUser={() => {}}
          onHandleUpdateUser={() => {}}
          onHandleDeleteUser={() => {}}
          onHandleCopy={() => {}}
          currentUser={null}
          formatDate={(date) => new Date(date).toLocaleDateString()}
          handleUserRoleChange={() => {}}
          handleUserPlanChange={() => {}}
          handleUserDevicesChange={() => {}}
          handleUserExpiresAtChange={() => {}}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Заголовок */}
        <div className="bg-slate-900 rounded-lg shadow-xl p-6 border border-slate-800">
          <h1 className="text-2xl font-bold text-slate-200 mb-4">
            Тест производительности
          </h1>
          <p className="text-slate-400">
            Сравнение виртуализированного и обычного списка
          </p>
        </div>

        {/* Переключатель */}
        <div className="bg-slate-900 rounded-lg shadow-xl p-6 border border-slate-800">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setUseVirtualization(false)}
              className={`px-6 py-3 rounded transition-colors ${
                !useVirtualization
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Обычный список
            </button>
            <button
              onClick={() => setUseVirtualization(true)}
              className={`px-6 py-3 rounded transition-colors ${
                useVirtualization
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Виртуализированный список
            </button>
          </div>

          {/* Метрики */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800 p-4 rounded">
              <div className="text-slate-400 text-sm mb-1">Время рендера</div>
              <div className="text-2xl font-bold text-slate-200">
                {renderTime.toFixed(2)}ms
              </div>
            </div>

            <div className="bg-slate-800 p-4 rounded">
              <div className="text-slate-400 text-sm mb-1">DOM-узлы</div>
              <div className="text-2xl font-bold text-slate-200">
                {domNodes.toLocaleString()}
              </div>
            </div>

            <div className="bg-slate-800 p-4 rounded">
              <div className="text-slate-400 text-sm mb-1">Память (до)</div>
              <div className="text-2xl font-bold text-slate-200">
                {memoryBefore?.used || '—'} MB
              </div>
            </div>

            <div className="bg-slate-800 p-4 rounded">
              <div className="text-slate-400 text-sm mb-1">Память (после)</div>
              <div className="text-2xl font-bold text-slate-200">
                {memoryAfter?.used || '—'} MB
              </div>
            </div>
          </div>

          {/* Разница в памяти */}
          {memoryBefore && memoryAfter && (
            <div className="mt-4 p-4 bg-slate-800 rounded">
              <div className="text-slate-300">
                Использовано памяти: {(
                  parseFloat(memoryAfter.used) - parseFloat(memoryBefore.used)
                ).toFixed(2)} MB
              </div>
            </div>
          )}
        </div>

        {/* Список */}
        {useVirtualization ? renderVirtualizedList() : renderNormalList()}

        {/* Инструкции */}
        <div className="bg-slate-900 rounded-lg shadow-xl p-6 border border-slate-800">
          <h2 className="text-lg font-bold text-slate-200 mb-4">
            Как использовать тест:
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Откройте DevTools (F12)</li>
            <li>Перейдите на вкладку "Performance"</li>
            <li>Нажмите "Record"</li>
            <li>Переключайтесь между режимами и скроллите список</li>
            <li>Остановите запись и сравните результаты</li>
            <li>Проверьте метрики в консоли браузера</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

export default PerformanceComparison

