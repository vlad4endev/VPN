-- Таблица пользователей для гибридной Telegram-авторизации.
-- Запустить один раз при настройке окружения.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id VARCHAR(32) NOT NULL UNIQUE,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  username VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

COMMENT ON TABLE users IS 'Пользователи VPN-сервиса, авторизация через Telegram (WebApp / Login Widget)';
