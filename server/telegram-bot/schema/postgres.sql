-- Таблицы для модуля Telegram Bot (state store + опционально логи событий).
-- PostgreSQL. Выполнить один раз при первом деплое.

-- Состояния пользователей (state machine / session)
CREATE TABLE IF NOT EXISTS telegram_bot_state (
  chat_id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_bot_state_expires_at ON telegram_bot_state (expires_at);

-- Опционально: логи действий пользователей (user_id, username, тип события, текст, timestamp)
CREATE TABLE IF NOT EXISTS telegram_user_events (
  id BIGSERIAL PRIMARY KEY,
  update_id BIGINT,
  user_id BIGINT,
  username VARCHAR(255),
  first_name VARCHAR(255),
  chat_id BIGINT,
  event_type VARCHAR(50) NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_user_events_user_id ON telegram_user_events (user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_events_chat_id ON telegram_user_events (chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_events_created_at ON telegram_user_events (created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_user_events_event_type ON telegram_user_events (event_type);

-- Очистка просроченных состояний (можно вызывать по cron):
-- DELETE FROM telegram_bot_state WHERE expires_at < NOW();
