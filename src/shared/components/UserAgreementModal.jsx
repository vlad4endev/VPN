import { X } from 'lucide-react'

const SUPPORT_URL = 'https://t.me/Skypathsupport'

const USER_AGREEMENT_CONTENT = (
  <>
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">1. Общие положения</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>1.1.</strong> Настоящее Пользовательское соглашение (далее — «Соглашение») является юридически обязательным документом, регулирующим порядок использования сервиса (далее — «Сервис»).
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>1.2.</strong> Используя Сервис, Пользователь подтверждает полное согласие с условиями Соглашения. Если Пользователь не согласен с условиями, он обязан немедленно прекратить использование Сервиса.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">2. Отказ от ответственности</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>2.1.</strong> Сервис предоставляется «как есть» («AS IS»). Администрация не даёт никаких гарантий, явных или подразумеваемых, в том числе относительно работоспособности, безопасности, соответствия ожиданиям или пригодности для конкретных целей.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>2.2.</strong> Администрация не несёт ответственности за:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2 mt-1">
      <li>любые убытки (включая потерю прибыли, данных, репутации), возникшие в результате использования или невозможности использования Сервиса;</li>
      <li>действия или бездействие третьих лиц;</li>
      <li>содержание, законность, качество, достоверность товаров, услуг или информации, полученных через Сервис;</li>
      <li>технические сбои, ошибки, задержки в работе или недоступность Сервиса.</li>
    </ul>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-2">
      <strong>2.3.</strong> Все риски, связанные с использованием Сервиса, полностью возлагаются на Пользователя.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">3. Ограничения</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>3.1.</strong> Пользователь обязуется самостоятельно оценивать законность своих действий при использовании Сервиса.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>3.2.</strong> Запрещено использовать Сервис для деятельности, противоречащей применимому законодательству.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>3.3.</strong> Администрация вправе в любой момент, без уведомления и объяснения причин:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2 mt-1">
      <li>ограничить или заблокировать доступ Пользователя к Сервису;</li>
      <li>удалить любую информацию;</li>
      <li>приостановить или прекратить работу Сервиса полностью или частично.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">4. Конфиденциальность</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>4.1.</strong> Администрация может собирать минимальный объём технических данных, необходимых для работы Сервиса.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>4.2.</strong> Администрация не гарантирует полную безопасность или анонимность передаваемых данных.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">5. Изменения в соглашении</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>5.1.</strong> Администрация имеет право в одностороннем порядке изменять условия Соглашения в любое время без предварительного уведомления.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>5.2.</strong> Продолжение использования Сервиса после внесения изменений означает согласие Пользователя с новыми условиями.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">6. Применимое право</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>6.1.</strong> Все вопросы и споры, связанные с использованием Сервиса, регулируются законодательством юрисдикции, определяемой Администрацией.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">7. Условия возврата</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>7.1.</strong> Так как Сервис предоставляет цифровые товары и/или услуги нематериального характера, возврат и обмен после их предоставления невозможен.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>7.2.</strong> Возврат средств может быть осуществлён только в случаях:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2 mt-1">
      <li>если услуга не была оказана по техническим причинам со стороны Сервиса;</li>
      <li>если доступ к цифровому товару не был предоставлен Пользователю.</li>
    </ul>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-2">
      <strong>7.3.</strong> Для оформления возврата Пользователь обязан обратиться в службу поддержки Сервиса в течение 24 часов с момента оплаты, указав номер заказа и контактные данные.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>7.4.</strong> Решение о возврате средств принимается Администрацией индивидуально в каждом случае.
    </p>
    <hr className="border-slate-700 my-4" />
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-2 italic">
      Начиная использование сервиса (в том числе, запуская бота и/или вводя команду /start), Пользователь подтверждает, что ознакомлен с настоящим Соглашением и безусловно принимает его условия, даже если фактически не прочитал его.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-4">
      В решении вопросов поможет:{' '}
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline"
      >
        t.me/Skypathsupport
      </a>
    </p>
  </>
)

/**
 * Модальное окно с текстом Пользовательского соглашения.
 * @param {boolean} isOpen - открыто ли окно
 * @param {Function} onClose - колбэк закрытия
 */
export default function UserAgreementModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-2 md:p-4 bg-black/60 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="agreement-modal-title"
    >
      <div
        className="bg-slate-900 border border-slate-800 w-full sm:max-w-[90vw] md:max-w-2xl lg:max-w-3xl rounded-none sm:rounded-2xl shadow-2xl min-h-full sm:min-h-0 sm:my-4 sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 p-4 sm:p-5 flex justify-between items-center gap-3">
          <h2 id="agreement-modal-title" className="text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] sm:text-xl font-bold text-white">
            Пользовательское соглашение
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
          {USER_AGREEMENT_CONTENT}
        </div>
      </div>
    </div>
  )
}
