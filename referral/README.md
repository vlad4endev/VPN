# Реферальный модуль (Next.js 14 + Prisma)

## Запуск

1. `cp .env.example .env` — задайте `DATABASE_URL`, `SESSION_SECRET`, при необходимости `NEXT_PUBLIC_APP_URL`.
2. `npm install`
3. `npx prisma migrate deploy` (или `npm run prisma:migrate` для разработки)
4. `DATABASE_URL=... npx prisma generate` — если клиент не собран
5. `npm run dev`

## Поведение

- `middleware` читает `?ref=` и ставит httpOnly-куку на 30 дней.
- Клиент дублирует код в `localStorage` (`referral_code_v1`).
- После регистрации вызывается `processReferral`: связь `User.referredBy`, записи `ReferralRecord` и отложенные `ReferralReward` (реферер + рефери, Win–Win).
- Антифрод: тот же пользователь / тот же email / совпадение IP регистрации / совпадение fingerprint → статус `FRAUD`, без начислений.
