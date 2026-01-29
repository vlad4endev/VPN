import { X } from 'lucide-react'

const PRIVACY_POLICY_CONTENT = (
  <>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Ваши данные важны для нас. Ниже мы рассказываем, какие данные мы собираем, зачем и как их защищаем.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Какие данные мы собираем</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Мы можем собирать:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>Контактную информацию: e-mail, при необходимости телефон;</li>
      <li>Платежные данные: для оплаты подписки через безопасные системы;</li>
      <li>Техническую информацию: устройство, операционная система, IP-адрес;</li>
      <li>Обращения в поддержку: ваши вопросы и история запросов.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Зачем нам нужны ваши данные</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Мы используем данные только для:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>предоставления и улучшения услуг VPN;</li>
      <li>обработки платежей и подписок;</li>
      <li>помощи через службу поддержки;</li>
      <li>анализа работы сервиса и устранения ошибок;</li>
      <li>соблюдения закона и предотвращения мошенничества.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Как мы храним данные</h3>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>Данные хранятся только столько, сколько нужно для работы сервиса и требований закона;</li>
      <li>После окончания срока хранения данные удаляются безопасно.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Передача данных третьим лицам</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Мы не продаём ваши данные. Передача возможна только:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>платёжным системам для оплаты;</li>
      <li>техническим партнёрам для работы сервиса;</li>
      <li>органам, если это требует закон.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Ваши права</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Вы можете:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>получать информацию о своих данных;</li>
      <li>исправлять или удалять их;</li>
      <li>ограничивать обработку или отзывать согласие.</li>
    </ul>
    <p className="text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] mt-2">
      ✉️ Чтобы воспользоваться правами, пишите на [ваш e-mail].
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Защита данных</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Мы защищаем ваши данные с помощью:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>шифрования и анонимизации;</li>
      <li>ограниченного доступа к информации;</li>
      <li>регулярных проверок систем на уязвимости.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Изменения в политике</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed">
      Мы можем обновлять эту политику.
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2">
      <li>Все изменения будут здесь, на сайте;</li>
      <li>При значительных изменениях мы уведомим пользователей.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">🔹 Контакты</h3>
    <p className="text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)]">
      Если есть вопросы о персональных данных: [ваш e-mail]
    </p>
  </>
)

/**
 * Модальное окно с текстом Политики конфиденциальности SKYPATH FLOW.
 * @param {boolean} isOpen - открыто ли окно
 * @param {Function} onClose - колбэк закрытия
 */
export default function PrivacyPolicyModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-2 md:p-4 bg-black/60 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
    >
      <div
        className="bg-slate-900 border border-slate-800 w-full sm:max-w-[90vw] md:max-w-2xl lg:max-w-3xl rounded-none sm:rounded-2xl shadow-2xl min-h-full sm:min-h-0 sm:my-4 sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-4 sm:p-5 flex justify-between items-center gap-3">
          <h2 id="privacy-modal-title" className="text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] sm:text-xl font-bold text-white">
            Политика конфиденциальности SKYPATH FLOW
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Закрыть"
          >
            <X size={20} className="sm:w-6 sm:h-6 text-slate-400" />
          </button>
        </div>
        <div className="p-4 sm:p-5 md:p-6 space-y-2">
          {PRIVACY_POLICY_CONTENT}
        </div>
      </div>
    </div>
  )
}
