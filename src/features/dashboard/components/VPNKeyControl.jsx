import React from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Shield } from 'lucide-react'

const VPNKeyControl = ({
    currentUser,
    onSetShowKeyModal,
    onGetKey
}) => {
    const { t } = useTranslation()

    return (
        <div className="mt-3 p-2.5 sm:p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex items-center justify-center">
            {currentUser.uuid ? (
                <button
                    onClick={() => onSetShowKeyModal(true)}
                    className="btn-icon-only-mobile btn-label-adaptive min-h-[40px] w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[clamp(0.75rem,0.7rem+0.35vw,1rem)] rounded-lg transition-all flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
                    aria-label={t('dashboard.config')}
                >
                    <Globe className="w-4 h-4 flex-shrink-0" />
                    <span className="btn-text">{t('dashboard.config')}</span>
                </button>
            ) : (
                <button
                    onClick={onGetKey}
                    className="btn-icon-only-mobile btn-label-adaptive min-h-[40px] w-full sm:w-auto px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-[clamp(0.75rem,0.7rem+0.35vw,1rem)] rounded-lg transition-all flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
                    aria-label={t('dashboard.getKey')}
                >
                    <Shield className="w-4 h-4 flex-shrink-0" />
                    <span className="btn-text">{t('dashboard.getKey')}</span>
                </button>
            )}
        </div>
    )
}

export default VPNKeyControl
