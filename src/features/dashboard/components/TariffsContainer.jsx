import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import AITariffHelper from './AITariffHelper.jsx'

const TariffsContainer = ({
    tariffs,
    settings,
    creatingSubscription,
    handleTariffSelect
}) => {
    const { t } = useTranslation()
    const [showAITariffHelper, setShowAITariffHelper] = useState(false)

    if (!tariffs || tariffs.length === 0) {
        return (
            <div className="flex justify-center items-center py-10">
                <Loader2 className="w-8 h-8 md:w-10 md:h-10 text-blue-500 animate-spin" />
            </div>
        )
    }

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 sm:mb-3">
                <h2 className="text-[clamp(1.125rem,1rem+0.625vw,1.5rem)] font-bold text-slate-200">
                    {t('dashboard.chooseTariff')}
                </h2>
                <button
                    type="button"
                    onClick={() => setShowAITariffHelper(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-400 font-medium text-sm transition-colors"
                >
                    <Sparkles className="w-4 h-4" />
                    {t('aiTariff.title', 'Подбор тарифа с ИИ')}
                </button>
            </div>
            {showAITariffHelper && (
                <AITariffHelper
                    tariffs={tariffs}
                    onSelectTariff={handleTariffSelect}
                    onClose={() => setShowAITariffHelper(false)}
                />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {tariffs.filter(t => t.active !== false).map((tariff) => {
                    const planKey = (tariff.plan || tariff.name || '').toLowerCase()
                    const nameKey = (tariff.name || '').toLowerCase()
                    const isSuper = planKey === 'super' || tariff.name === 'Super'
                    const isMulti = planKey === 'multi' || tariff.name === 'MULTI'
                    const isMegaMix = nameKey === 'megamix'

                    const tariffDescriptions = {
                        super: 'Идеален для смартфона и планшета: приоритетная поддержка и быстрое подключение. Обход блокировок и белых списков — один аккаунт для мобильного интернета.',
                        multi: 'До 5 устройств сразу: ТВ-приставки, компьютеры, роутеры. Высокая скорость без белого списка — для дома и офиса. Подключите всё, что нужно.',
                        megamix: 'Два тарифа в одной подписке: объедините возможности Super и MULTI. Больше гибкости и выгоды, когда нужны и мобильный доступ, и домашняя сеть.',
                    }

                    const linkedConfigs = Array.isArray(tariff.linkedTariffConfigs) && tariff.linkedTariffConfigs.length > 0 ? tariff.linkedTariffConfigs : null
                    const linkedIds = Array.isArray(tariff.linkedTariffIds) ? tariff.linkedTariffIds.filter(Boolean) : []
                    const isCombinedTariff = linkedConfigs?.length > 0 || linkedIds.length > 0

                    let totalDevices = tariff.devices ?? 1
                    let totalTrafficGB = tariff.trafficGB ?? 0
                    let linkedBreakdown = null

                    if (linkedConfigs?.length > 0) {
                        totalDevices = linkedConfigs.reduce((sum, c) => sum + (Number(c.devices) || 1), 0)
                        const hasUnlimited = linkedConfigs.some(c => (Number(c.trafficGB) ?? 0) === 0)
                        totalTrafficGB = hasUnlimited ? 0 : linkedConfigs.reduce((sum, c) => sum + (Number(c.trafficGB) || 0), 0)
                        linkedBreakdown = linkedConfigs.map(c => {
                            const name = tariffs.find(t => t.id === c.tariffId)?.name || c.tariffId || ''
                            const d = Number(c.devices) || 1
                            const tr = (Number(c.trafficGB) ?? 0)
                            return { name, devices: d, trafficGB: tr }
                        })
                    } else if (linkedIds.length > 0) {
                        const resolved = linkedIds.map(tid => tariffs.find(t => t.id === tid)).filter(Boolean)
                        if (resolved.length > 0) {
                            totalDevices = resolved.reduce((sum, tgt) => sum + (Number(tgt.devices) || 1), 0)
                            const hasUnlimited = resolved.some(tgt => (Number(tgt.trafficGB) ?? 0) === 0)
                            totalTrafficGB = hasUnlimited ? 0 : resolved.reduce((sum, tgt) => sum + (Number(tgt.trafficGB) || 0), 0)
                            linkedBreakdown = resolved.map(tgt => ({ name: tgt.name, devices: Number(tgt.devices) || 1, trafficGB: tgt.trafficGB ?? 0 }))
                        }
                    }

                    const devicesCount = isCombinedTariff ? totalDevices : (tariff.devices ?? 1)
                    const devicesWord = devicesCount === 1 ? t('dashboard.deviceOne') : t('dashboard.devicesMany')

                    const description = tariff.description ?? (
                        isSuper ? tariffDescriptions.super
                            : isMulti ? tariffDescriptions.multi
                                : isMegaMix ? tariffDescriptions.megamix
                                    : `До ${devicesCount} ${devicesWord}. Стандартная поддержка и стабильное подключение. Подойдёт для повседневного использования.`
                    )

                    const conditionsFromSettings = settings?.tariffConditions?.[nameKey] || settings?.tariffConditions?.[planKey] || (nameKey !== 'super' && nameKey !== 'multi' && nameKey !== 'megamix' ? settings?.tariffConditions?.default : null)
                    const trafficGB = isCombinedTariff ? totalTrafficGB : (tariff.trafficGB ?? 0)

                    const durationDays = tariff.durationDays ?? 30
                    const durationMonths = durationDays >= 30 ? Math.round(durationDays / 30) : 0
                    const durationLabel = durationMonths >= 1 ? `${durationMonths} ${t('dashboard.month', 'мес.')}` : `${durationDays} ${t('dashboard.daysShort', 'дн.')}`

                    return (
                        <div key={tariff.id} className="bg-slate-800/80 rounded-lg p-3 sm:p-3.5 border border-slate-700 flex flex-col min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                <h3 className="text-[clamp(1.1rem,1rem+0.4vw,1.35rem)] font-bold text-white truncate">{tariff.name}</h3>
                                {isSuper && (
                                    <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] sm:text-xs font-bold rounded-full shrink-0">
                                        {t('dashboard.hit')}
                                    </span>
                                )}
                            </div>
                            <div className="mb-2">
                                <span className="text-[clamp(1.25rem,1.15rem+0.35vw,1.6rem)] font-bold text-blue-400">{tariff.price ?? 0}</span>
                                <span className="text-slate-400 ml-1 text-xs sm:text-sm">{t('dashboard.perMonthShort')}</span>
                            </div>

                            <div className="mb-2 py-2 px-2.5 bg-slate-900/60 rounded-lg border border-slate-700/80">
                                <p className="text-slate-400 text-[0.6875rem] sm:text-xs font-medium mb-1.5">{t('dashboard.whatIncluded', 'Что входит')}</p>
                                <ul className="space-y-1 text-[0.6875rem] sm:text-xs text-slate-300">
                                    <li className="flex justify-between gap-2">
                                        <span className="text-slate-500">{t('dashboard.devices', 'Устройств')}</span>
                                        <span className="font-medium text-slate-300">{devicesCount}</span>
                                    </li>
                                    <li className="flex justify-between gap-2">
                                        <span className="text-slate-500">{t('dashboard.traffic', 'Трафик')}</span>
                                        <span className="font-medium text-slate-300">{trafficGB > 0 ? `${trafficGB} GB` : t('dashboard.unlimited', 'Безлимит')}</span>
                                    </li>
                                    <li className="flex justify-between gap-2">
                                        <span className="text-slate-500">{t('dashboard.periodShort', 'Срок')}</span>
                                        <span className="font-medium text-slate-300">{durationLabel}</span>
                                    </li>
                                </ul>
                                {linkedBreakdown && linkedBreakdown.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-700/80">
                                        <p className="text-slate-500 text-[0.625rem] sm:text-[0.6875rem] font-medium mb-1">
                                            {t('dashboard.includesTariffs', 'Входит по тарифам')}
                                        </p>
                                        <ul className="space-y-0.5 text-[0.625rem] sm:text-[0.6875rem] text-slate-400">
                                            {linkedBreakdown.map((item, idx) => (
                                                <li key={idx}>
                                                    <span className="font-medium text-slate-400">{item.name}</span>
                                                    {' — '}
                                                    <span>{item.devices} {item.devices === 1 ? t('dashboard.deviceOne') : t('dashboard.devicesMany').toLowerCase()}</span>
                                                    {', '}
                                                    <span>{item.trafficGB > 0 ? `${item.trafficGB} GB` : t('dashboard.unlimited', 'Безлимит').toLowerCase()}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="mb-3 flex-1 min-h-0">
                                <p className="text-slate-400 text-xs sm:text-[0.8125rem] leading-snug line-clamp-3">
                                    {description}
                                </p>
                                {conditionsFromSettings && conditionsFromSettings.trim() && (
                                    <p className="text-slate-500 text-[0.6875rem] sm:text-xs leading-snug mt-1.5 line-clamp-2">
                                        {conditionsFromSettings.trim()}
                                    </p>
                                )}
                            </div>

                            <button
                                onClick={() => handleTariffSelect(tariff)}
                                disabled={creatingSubscription}
                                className="w-full min-h-[38px] sm:min-h-[40px] px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition-all flex items-center justify-center touch-manipulation mt-auto"
                                aria-label={t('dashboard.selectTariffAria', { name: tariff.name })}
                            >
                                {creatingSubscription ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : null}
                                {t('dashboard.selectTariffBtn', 'Выбрать')}
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default TariffsContainer
