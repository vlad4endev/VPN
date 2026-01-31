import { X } from 'lucide-react'

const PRIVACY_POLICY_CONTENT = (
  <>
    <p className="text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] mb-4">
      August 15, 2025
    </p>
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">1. Общие положения</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>1.1.</strong> Настоящая Политика конфиденциальности (далее — «Политика») регулирует порядок обработки и защиты информации, которую Пользователь передаёт при использовании сервиса (далее — «Сервис»).
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>1.2.</strong> Используя Сервис, Пользователь подтверждает своё согласие с условиями Политики. Если Пользователь не согласен с условиями — он обязан прекратить использование Сервиса.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">2. Сбор информации</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>2.1.</strong> Сервис может собирать следующие типы данных:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2 mt-1">
      <li>идентификаторы аккаунта (логин, ID, никнейм и т.п.);</li>
      <li>техническую информацию (IP-адрес, данные о браузере, устройстве и операционной системе);</li>
      <li>историю взаимодействий с Сервисом.</li>
    </ul>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-2">
      <strong>2.2.</strong> Сервис не требует от Пользователя предоставления паспортных данных, документов, фотографий или другой личной информации, кроме минимально необходимой для работы.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">3. Использование информации</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>3.1.</strong> Сервис может использовать полученную информацию исключительно для:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2 mt-1">
      <li>обеспечения работы функционала;</li>
      <li>связи с Пользователем (в том числе для уведомлений и поддержки);</li>
      <li>анализа и улучшения работы Сервиса.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">4. Передача информации третьим лицам</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>4.1.</strong> Администрация не передаёт полученные данные третьим лицам, за исключением случаев:
    </p>
    <ul className="list-disc list-inside text-slate-400 text-[clamp(0.8125rem,0.75rem+0.25vw,0.9375rem)] space-y-1 ml-2 mt-1">
      <li>если это требуется по закону;</li>
      <li>если это необходимо для исполнения обязательств перед Пользователем (например, при работе с платёжными системами);</li>
      <li>если Пользователь сам дал на это согласие.</li>
    </ul>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">5. Хранение и защита данных</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>5.1.</strong> Данные хранятся в течение срока, необходимого для достижения целей обработки.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>5.2.</strong> Администрация принимает разумные меры для защиты данных, но не гарантирует абсолютную безопасность информации при передаче через интернет.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">6. Отказ от ответственности</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>6.1.</strong> Пользователь понимает и соглашается, что передача информации через интернет всегда сопряжена с рисками.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>6.2.</strong> Администрация не несёт ответственности за утрату, кражу или раскрытие данных, если это произошло по вине третьих лиц или самого Пользователя.
    </p>
    <hr className="border-slate-700 my-4" />
    <h3 className="text-slate-200 font-semibold text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] mt-4">7. Изменения в Политике</h3>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>7.1.</strong> Администрация вправе изменять условия Политики без предварительного уведомления.
    </p>
    <p className="text-slate-300 text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] leading-relaxed mt-1">
      <strong>7.2.</strong> Продолжение использования Сервиса после внесения изменений означает согласие Пользователя с новой редакцией Политики.
    </p>
  </>
)

/**
 * Модальное окно с текстом Политики конфиденциальности.
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
            Политика конфиденциальности
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
