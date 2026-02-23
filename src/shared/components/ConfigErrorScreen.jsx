import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'

/**
 * Компонент экрана ошибки конфигурации
 * Отображается когда Firebase или переменные окружения не настроены правильно
 *
 * @param {Object} props
 * @param {string} props.configError - Текст ошибки конфигурации
 */
export default function ConfigErrorScreen({ configError }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="max-w-2xl w-full bg-slate-900 rounded-lg shadow-xl p-8 border border-red-800">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <h1 className="text-2xl font-bold text-red-400">{t('config.errorTitle')}</h1>
        </div>
        <div className="bg-slate-800 rounded p-4 mb-4">
          <pre className="text-slate-300 text-sm whitespace-pre-wrap font-mono">
            {configError}
          </pre>
        </div>
        <div className="text-slate-400 text-sm space-y-2">
          <p><strong className="text-slate-300">{t('config.whatToDo')}</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>{t('config.step1')}</li>
            <li>{t('config.step2')}</li>
            <li>{t('config.step3')}</li>
            <li>{t('config.step4')}</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

