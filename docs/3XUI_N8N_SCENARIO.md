# Сценарий запросов 3x-ui в n8n (модуль проекта)

Описание веток workflow и соответствующих вызовов 3x-ui API по телу Webhook.

---

## Схема веток (Switch по `body.operation` / `body.mode` / `body.category`)

| Условие | Ветка | 3x-ui запросы |
|--------|--------|----------------|
| `operation === "add_client"` и `mode === "generateLink"` | Switch1 (по тарифу Super / MULTI / update_subscription) | Login → addClient или Login → addClient (другой сервер) |
| `operation === "delete_client"` | Login → delClient | Login → POST delClient |
| `status === " CONFIRMED"` | Get many rows → Update a row | — |
| `mode === "=verifyPayment"` | Get many rows1 → Edit Fields1 | — |
| `mode === "createPayment"` | платеж1 → Create a row1 | — |
| `category === " get_user_data"` | Login1 → получения | **Login → GET getClientTrafficsById** |

---

## 1. Добавление клиента (add_client + generateLink)

**Триггер:** Webhook с `body.operation === "add_client"` и `body.mode === "generateLink"`.

**Switch1 по тарифу:**
- **Super** → Code10 (uuid, sub, дата) → **Login3** → **Создание клиента1** → Edit Fields5
- **MULTI** → **Login 178** → **Создание клиента** → Edit Fields
- **update_subscription** → **Login6** → **Создание клиента2** (updateClient)

### 1.1 Ветка Super (сервер 84.201.161.204:40919)

| Шаг | Узел | Метод | URL | Тело / заголовки |
|-----|------|--------|-----|------------------|
| 1 | Login3 | POST | `https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw/login` | `{"username":"...","password":"..."}` |
| 2 | Создание клиента1 | POST | `https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw/panel/api/inbounds/addClient` | См. ниже |

**Тело addClient (Создание клиента1):**
```json
{
  "id": "{{ body.inboundId }}",
  "settings": "{\"clients\":[{\"id\":\"{{ body.userUuid }}\",\"flow\":\"xtls-rprx-vision\",\"email\":\"{{ body.email }}\",\"limitIp\":{{ body.limitIp }},\"totalGB\":{{ body.totalGB }},\"expiryTime\":{{ body.subscriptionDetails.period.expiryDate3xui }},\"enable\":true,\"tgId\":\" \",\"subId\":\"{{ body.subId }}\",\"reset\":0}]}"
}
```
Cookie: `$json.headers["set-cookie"][0]` из ответа Login3.

### 1.2 Ветка MULTI (сервер 85.192.25.201:40910)

| Шаг | Узел | Метод | URL | Тело |
|-----|------|--------|-----|------|
| 1 | Login 178 | POST | `https://85.192.25.201:40910/KolbUBTWA0/login` | username, password |
| 2 | Создание клиента | POST | `.../panel/api/inbounds/addClient` | id: 13, settings с userName, devices, expiryDate3xui, subId |

### 1.3 Ветка update_subscription (обновление клиента)

| Шаг | Узел | Метод | URL | Тело |
|-----|------|--------|-----|------|
| 1 | Login6 | POST | `https://{{ body.serverIP }}:{{ body.serverPort }}{{ body.randompath }}login` | ⚠️ **Исправление:** нужен слэш: `{{ body.randompath }}/login` |
| 2 | Создание клиента2 | POST | `.../panel/api/inbounds/updateClient/{{ body.clientId }}` | id: inboundId, settings (clients с userUuid, email, limitIp, totalGB, expiryTime, subId) |

---

## 2. Удаление клиента (delete_client)

**Триггер:** `body.operation === "delete_client"`.

| Шаг | Узел | Метод | URL | Заголовки |
|-----|------|--------|-----|-----------|
| 1 | Login | POST | `https://{{ body.serverIP }}:{{ body.serverPort }}{{ body.randompath }}login` | ⚠️ **Исправление:** `{{ body.randompath }}/login` |
| 2 | удаление | POST | `https://{{ body.serverIP }}:{{ body.serverPort }}{{ body.randompath }}panel/api/inbounds/{{ body.inboundId }}/delClient/{{ body.clientId }}` | Cookie из Login |

---

## 3. Получение трафика по UUID (get_user_data)

**Триггер:** `body.category === " get_user_data"`.

| Шаг | Узел | Метод | URL | Заголовки |
|-----|------|--------|-----|-----------|
| 1 | Login1 | POST | `https://{{ subscriptionServerData[0].ip }}:{{ port }}{{ path }}/login` | — |
| 2 | получения | **GET** | `.../panel/api/inbounds/getClientTrafficsById/{{ body.clientId }}` | Cookie из Login1 |

⚠️ **Важно:** эндпоинт **getClientTrafficsById** в 3x-ui — это **GET**, не POST. В узле «получения» в n8n указан метод POST — его нужно сменить на **GET** и убрать тело запроса.

**Корректный URL для получения трафика:**
```
https://{{ subscriptionServerData[0].ip }}:{{ subscriptionServerData[0].port }}{{ subscriptionServerData[0].path }}panel/api/inbounds/getClientTrafficsById/{{ body.clientId }}
```
Метод: **GET**. Заголовки: `Accept: application/json`, `Cookie: <из Login1>`.

---

## Исправления в workflow (чеклист)

1. **Login / Login6:** в URL после `randompath` добавить слэш перед `login`:
   - Было: `{{ body.randompath }}login`
   - Надо: `{{ body.randompath }}/login`
2. **получения (getClientTrafficsById):**
   - Метод: **GET** (не POST).
   - Убрать отправку body (для GET тело не используется).
3. **Login1:** убедиться, что в URL путь к логину корректный (например `.../path/login` или `.../path/login/` в зависимости от того, есть ли слэш в `path`).

---

## Сводка 3x-ui запросов по сценарию

| Операция | Метод | Путь | Откуда данные |
|----------|--------|------|----------------|
| Логин | POST | `{BASE}/login` | serverIP, serverPort, randompath или subscriptionServerData[0]; xuiUsername, xuiPassword |
| Добавить клиента | POST | `{BASE}/panel/api/inbounds/addClient` | body: id (inboundId), settings (JSON string с clients) |
| Обновить клиента | POST | `{BASE}/panel/api/inbounds/updateClient/{clientId}` | body: id (inboundId), settings |
| Удалить клиента | POST | `{BASE}/panel/api/inbounds/{inboundId}/delClient/{clientId}` | — |
| Трафик по UUID | **GET** | `{BASE}/panel/api/inbounds/getClientTrafficsById/{uuid}` | clientId = UUID клиента |

**BASE** в вашем случае:
- либо фиксированный (`https://84.201.161.204:40919/Gxckr4KcZGtB6aOZdw`, `https://85.192.25.201:40910/KolbUBTWA0`),
- либо из Webhook: `https://{{ serverIP }}:{{ serverPort }}{{ randompath }}` (со слэшем перед следующими сегментами: `/login`, `/panel/...`).

---

## Пример тела Webhook для тестов

**add_client + generateLink (Super):**
```json
{
  "operation": "add_client",
  "mode": "generateLink",
  "inboundId": 6,
  "userUuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "limitIp": 2,
  "totalGB": 32212254720,
  "subId": "abc123def456",
  "subscriptionDetails": {
    "tariffName": "Super",
    "period": { "expiryDate3xui": 1735689600000 }
  }
}
```

**delete_client:**
```json
{
  "operation": "delete_client",
  "serverIP": "84.201.161.204",
  "serverPort": "40919",
  "randompath": "/Gxckr4KcZGtB6aOZdw",
  "xuiUsername": "...",
  "xuiPassword": "...",
  "inboundId": 6,
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**get_user_data (трафик по UUID):**
```json
{
  "category": " get_user_data",
  "clientId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "subscriptionServerData": [
    { "ip": "84.201.161.204", "port": "40919", "path": "/Gxckr4KcZGtB6aOZdw/" }
  ],
  "xuiUsername": "...",
  "xuiPassword": "..."
}
```

После исправления URL логина и метода getClientTrafficsById сценарий будет соответствовать 3x-ui API.
