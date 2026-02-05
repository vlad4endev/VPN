/**
 * Константы реферальной системы
 */

/** Размер реферального кода (символов) */
export const REFERRAL_CODE_LENGTH = 8

/** Символы для генерации кода (без 0/O, 1/l для читаемости) */
export const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Ключ в sessionStorage для сохранения реферального кода до регистрации */
export const REFERRAL_CODE_STORAGE_KEY = 'referral_code_pending'

/** Сумма бонуса приглашающему за одного приглашённого (баллы/рубли) — можно переопределить через env на бэкенде */
export const REFERRAL_BONUS_AMOUNT_DEFAULT = 100
