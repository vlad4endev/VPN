import { AlertCircle } from 'lucide-react'

/**
 * Компонент экрана ошибки конфигурации
 * Отображается когда Firebase или переменные окружения не настроены правильно
 * 
 * @param {Object} props
 * @param {string} props.configError - Текст ошибки конфигурации
 */
export default function ConfigErrorScreen({ configError }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="max-w-2xl w-full bg-slate-900 rounded-lg shadow-xl p-8 border border-red-800">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <h1 className="text-2xl font-bold text-red-400">Ошибка конфигурации</h1>
        </div>
        <div className="bg-slate-800 rounded p-4 mb-4">
          <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono">
            {configError}
          </pre>
        </div>
        <div className="text-slate-400 text-sm space-y-2">
          <p><strong className="text-slate-300">Что делать:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Создайте файл <code className="bg-slate-800 px-2 py-1 rounded">.env</code> в корне проекта</li>
            <li>Скопируйте пример из <code className="bg-slate-800 px-2 py-1 rounded">.env.example</code> (если есть)</li>
            <li>Заполните все переменные окружения своими значениями</li>
            <li>Перезапустите приложение</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

