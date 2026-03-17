# Миграция Firebase -> Supabase

Этот проект уже содержит базовую автоматизацию для переноса данных из Firestore в Supabase.

## Что добавлено

- SQL-схема Supabase: `server/supabase/migrations/20260318_init_vpn_schema.sql`
- Скрипт миграции данных: `server/scripts/migrate-firebase-to-supabase.mjs`
- npm-команда: `cd server && npm run migrate:supabase`
- Dual-write пользователей: `server/routes/auth.api.js` синхронизирует `users_v4` -> `public.vpn_users`

## 1) Подготовка переменных окружения

В `server/.env` или корневом `.env` должны быть:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT_KEY` или путь к ключу)
- `APP_ID` (если отличается от `skyputh`)

## 2) Создание таблиц в Supabase

Выполните SQL из файла:

- `server/supabase/migrations/20260318_init_vpn_schema.sql`

Можно через Supabase SQL Editor или MCP `apply_migration`.

## 3) Установка зависимостей сервера

```bash
cd server
npm install
```

## 4) Перенос данных

```bash
cd server
npm run migrate:supabase
```

Скрипт:

- рекурсивно обходит документы в Firestore под `artifacts/{APP_ID}`
- переносит все документы в `public.vpn_firestore_documents` (JSONB)
- дополнительно формирует витрины:
  - `public.vpn_users`
  - `public.vpn_tariffs`
  - `public.vpn_payments`

## Важно про Auth

Полный перенос Firebase Auth -> Supabase Auth без потери паролей обычно невозможен напрямую (из-за ограничений на экспорт хешей).

Практичный путь:

1. Мигрировать профильные данные пользователей в `vpn_users` (уже реализовано).
2. Создавать пользователей в Supabase Auth при первом входе / через reset-password flow.
3. После периода совместной работы отключить Firebase Auth.

## Что дальше для полного отказа от Firebase

1. Переписать клиентские вызовы Firestore (`src/**`) на Supabase (`select/insert/update`).
2. Переписать серверные Firestore-операции (`server/**`) на Supabase.
3. Настроить RLS-политики под роли (`user/admin`).
4. Включить временный dual-write (Firebase + Supabase), затем cutover.
