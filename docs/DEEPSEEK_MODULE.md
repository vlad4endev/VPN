# Модуль DeepSeek AI

Интеграция DeepSeek в бэкенд для автоматизации процессов: ответы в поддержку, суммаризация текстов, классификация обращений и т.д.

## Настройка

1. Получить API-ключ: [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys).
2. **Вариант А — через админ-панель (рекомендуется):** Админка → Интеграции → **ИИ (DeepSeek)** → ввести ключ в поле «API-ключ DeepSeek» → «Сохранить ключ». Ключ сохраняется в Firestore (`artifacts/APP_ID/public/settings.deepseekApiKey`), без правки .env.
3. **Вариант Б — через .env:** В `server/.env` добавить:
   ```env
   DEEPSEEK_API_KEY=sk-...
   ```
   Приоритет: сначала проверяется `DEEPSEEK_API_KEY` из env, затем ключ из Firestore (админка).

Опционально в админке (раздел «Детальная настройка»): модель, temperature, макс. токенов, таймаут, системный промпт по умолчанию. Либо в .env: `DEEPSEEK_MODEL=deepseek-chat` или `deepseek-reasoner`.

Без ключа (ни в .env, ни в админке) эндпоинты `/api/ai/*` возвращают 503.

## API

### POST /api/ai/chat

Чат-запрос к DeepSeek. **Доступ: только админ** (Firebase ID token в заголовке `Authorization: Bearer <token>`).

**Тело запроса (JSON):**

| Поле         | Тип   | Обязательно | Описание |
|-------------|-------|-------------|----------|
| `messages`  | array | да          | Массив `{ role: "system" \| "user" \| "assistant", content: string }`. |
| `model`     | string| нет         | Модель (по умолчанию из env или `deepseek-chat`). |
| `temperature` | number | нет       | 0–1 (по умолчанию 0.7). |
| `max_tokens`  | number | нет       | Лимит токенов ответа (по умолчанию 2048). |
| `timeout`     | number | нет       | Таймаут запроса в секундах (по умолчанию 60). |

**Пример:**

```bash
curl -X POST "https://your-domain.com/api/ai/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <Firebase_ID_token>" \
  -H "X-App-Id: skyputh" \
  -d '{
    "messages": [
      {"role": "system", "content": "Ты помощник поддержки VPN-сервиса. Отвечай кратко и по делу."},
      {"role": "user", "content": "Как продлить подписку?"}
    ]
  }'
```

**Успешный ответ (200):**

```json
{
  "success": true,
  "content": "Подписку можно продлить в личном кабинете...",
  "usage": { "prompt_tokens": 42, "completion_tokens": 80, "total_tokens": 122 }
}
```

**Ошибки:** 400 (неверное тело), 401/403 (не админ), 502/503/504 (ошибка или недоступность DeepSeek).

### POST /api/ai/support-suggest — ответ по тикету (автоконсультация)

**Доступ: только админ.** По `ticketId` загружаются тикет, переписка и данные пользователя из базы (подписка, тариф, срок действия). ИИ анализирует вопрос и предлагает дружелюбный ответ. Если в вопросе упоминаются ошибки, логи, сбои — ИИ помечает ответ как **эскалация**: админу уходит уведомление в Telegram, в ответ пользователю подставляется предупреждение («обращение передано специалисту»).

**Тело:** `{ "ticketId": "..." }`.

**Ответ (200):** `{ "success": true, "reply": "текст ответа", "escalate": false }` или при эскалации:  
`{ "success": true, "reply": "...", "escalate": true, "userWarning": "Предупреждение пользователю", "escalateReason": "причина" }`.

В админке: раздел **Тикеты** → выбрать обращение → кнопка **«Ответ ИИ»**. Текст подставляется в поле ввода; при эскалации показывается предупреждение и уведомление уходит администратору в Telegram.

## Использование в коде сервера

Модуль `server/lib/deepseek.js` можно вызывать из других частей бэкенда (n8n workflows, обработчики тикетов и т.д.):

```js
import { chat, complete, isAvailable } from './lib/deepseek.js'

// Полный формат (массив сообщений)
const result = await chat([
  { role: 'system', content: 'Ты помощник поддержки.' },
  { role: 'user', content: 'Как сменить пароль?' },
], { temperature: 0.5, max_tokens: 1024 })

// Упрощённый вызов (один системный промпт + сообщение пользователя)
const short = await complete('Кратко перескажи: ' + longText, 'Отвечай одним абзацем.')

if (result.ok) {
  console.log(result.content)
  console.log(result.usage)
} else {
  console.error(result.error, result.code)
}
```

## Идеи для автоматизации

- **Тикеты поддержки:** по новому сообщению от пользователя вызывать `complete(текст_тикета, systemPrompt)` и предлагать черновик ответа оператору или отправлять авто-ответ по правилам.
- **Суммаризация:** краткое изложение длинных писем или логов.
- **Классификация:** категория обращения (техподдержка, оплата, жалоба) по тексту для маршрутизации.
- **n8n:** HTTP Request в workflow на `POST /api/ai/chat` с админ-токеном для сценариев автоматизации.

Документация DeepSeek API: [api-docs.deepseek.com](https://api-docs.deepseek.com/).
