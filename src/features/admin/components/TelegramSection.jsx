import { useState } from 'react'
import { Send, Bot } from 'lucide-react'
import TelegramPanel from './TelegramPanel.jsx'
import TelegramBotScenarioPanel from './TelegramBotScenarioPanel.jsx'

const SUB_TABS = [
  { id: 'settings', label: 'Настройки', icon: Send },
  { id: 'scenario', label: 'Сценарий бота', icon: Bot },
]

/**
 * Раздел Telegram в админке: две вкладки — «Настройки» (токен, webhook, Chat ID) и «Сценарий бота» (конструктор).
 */
const TelegramSection = () => {
  const [subTab, setSubTab] = useState('settings')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-800/60 border border-slate-700 w-fit">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === id
                ? 'bg-slate-700 text-slate-100 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      {subTab === 'settings' && <TelegramPanel />}
      {subTab === 'scenario' && <TelegramBotScenarioPanel />}
    </div>
  )
}

export default TelegramSection
