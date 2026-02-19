# Модуль ИИ (многопровайдерный)

Единая интеграция ИИ в бэкенд: **DeepSeek**, **OpenAI**, **OpenRouter**, **Google Gemini**. Используется для автоответов в поддержке (Майкл), предложения ответа по тикету, аналитики воронки (стратегия возврата) и тестовых запросов из админки.

## Провайдеры

| Провайдер    | Env-переменная     | Где взять ключ |
|-------------|--------------------|----------------|
| DeepSeek    | `DEEPSEEK_API_KEY` | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| OpenAI      | `OPENAI_API_KEY`   | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| OpenRouter  | `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| Google Gemini | `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

## Настройка

1. **Через админку (рекомендуется):** Интеграции → **ИИ** → выбрать провайдер → ввести API-ключ → «Сохранить ключ». Ключи хранятся в Firestore (`artifacts/APP_ID/public/settings`: `deepseekApiKey`, `openaiApiKey`, `openrouterApiKey`, `geminiApiKey`).
2. **Через .env:** задать одну из переменных выше. Приоритет: сначала env, затем Firestore.

В админке также задаются: модель, temperature, макс. токенов, таймаут, системный промпт по умолчанию. Без ключа для выбранного провайдера эндпоинты `/api/ai/*` возвращают 503.

## Где используется

- **Поддержка (Майкл):** автоответ при новом сообщении пользователя в тикете и при создании тикета — провайдер и модель из настроек ИИ.
- **Тикеты → «Ответ ИИ»:** предложение ответа по тикету (support-suggest).
- **Аналитика → AI-Воронка:** генерация стратегии возврата и сообщения для клиента (ai-strategy).
- **POST /api/ai/chat:** универсальный чат-запрос (тест из админки и автоматизация).

## API

### POST /api/ai/chat

Чат-запрос к выбранному провайдеру. **Доступ: только админ.**

Тело: `{ "messages": [{ "role": "system"|"user"|"assistant", "content": "..." }], "model?", "temperature?", "max_tokens?", "timeout?" }`.

Ответ: `{ "success": true, "content": "...", "usage?" }` или ошибка 502/503/504.

### GET /api/admin/ai/status

Только админ. Возвращает: `configured`, `provider`, `providers`, `model`, `models`, `temperature`, `maxTokens`, `timeoutSeconds`, `systemPromptPreset`.

### PATCH /api/admin/ai/settings

Только админ. Тело: `provider?`, `apiKey?`, `model?`, `temperature?`, `maxTokens?`, `timeoutSeconds?`, `systemPromptPreset?`.

## Код сервера

Единый вызов через `server/lib/ai/index.js`:

```js
import { unifiedChat, PROVIDERS, PROVIDER_MODELS } from './lib/ai/index.js'

const config = await getActiveAiConfig() // из n8n-webhook-proxy или свой
const result = await unifiedChat(
  [{ role: 'system', content: '...' }, { role: 'user', content: '...' }],
  {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    timeout: config.timeout,
  }
)
```

Провайдеры: `server/lib/ai/providers/deepseek.js`, `openai.js`, `openrouter.js`, `gemini.js`.

Старая документация по одному провайдеру: [DEEPSEEK_MODULE.md](./DEEPSEEK_MODULE.md).
