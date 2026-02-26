# Спецификация тела запроса для n8n webhook (8a8b74ff-eedf-4ad2-9783-a5123ac073ed)

Данные, которые отправляет фронт/backend в webhook, должны совпадать с тем, что читает workflow из `$('Webhook').item.json.body` (или `$json.body` в узлах, получающих элемент от Webhook).

---

## 1. Add client (`operation === 'add_client'`)

### Отправляем (dashboardService → n8n-webhook-proxy → n8n)

| Поле | Тип | Пример | Описание |
|------|-----|--------|----------|
| `operation` | string | `"add_client"` | Обязательно для ветки add_client |
| `category` | string | `"new_subscription"` | |
| `userId` | string | Firebase UID | |
| `userUuid` | string | UUID | То же, что clientId (id клиента в 3x-ui) |
| `userName` | string | Имя пользователя | |
| `userEmail` | string | Email | |
| `email` | string | Имя или email | Используется в 3x-ui как email клиента (в ветке Super / Создание клиента1) |
| `inboundId` | number | 13 | ID инбаунда |
| `totalGB` | number | 3221225472 | Трафик в **байтах** |
| `expiryTime` | number | 1772140493560 | Окончание в **миллисекундах** |
| `limitIp` | number | 5 | Количество устройств |
| `clientId` | string | UUID | UUID клиента (то же, что userUuid) |
| `subId` | string | "ii1tzal54r1xricb" | Ключ подписки для ссылки |
| `tgId` | string | Telegram ID | |
| `serverId` | string | ID сервера в настройках | |
| `serverIP` | string | "85.192.25.201" | Хост панели 3x-ui |
| `serverPort` | number | 40910 | Порт |
| `randompath` | string | "/KolbUBTWA0/" | Базовый путь (слэши как в настройках) |
| `protocol` | string | "https" | |
| `xuiUsername` | string | Логин панели | Обязательно при отсутствии sessionCookie |
| `xuiPassword` | string | Пароль панели | |
| `subscriptionDetails` | object | | Обязательно для веток Super/MULTI |
| `subscriptionDetails.tariffName` | string | "MULTI" / "Super" | Для Switch1 (выбор ветки) |
| `subscriptionDetails.devices` | number | 5 | limitIp для MULTI |
| `subscriptionDetails.userName` | string | Имя в 3x-ui (email) | Для MULTI в addClient |
| `subscriptionDetails.period.expiryDate3xui` | number | 1772140493560 | В **миллисекундах** для 3x-ui |
| `subscriptionDetails.period.expiryDateUnix` | number | 1772140493 | В **секундах** (для поля ПодпискаДо) |
| `subscriptionDetails.period.expiryDateIso` | string | ISO дата | |
| `subscriptionDetails.period.months` | number | 1 | |
| `subscriptionDetails.profileUuid` | string | UUID | |

### Что читает workflow

- **Login 178, Login3, Создание клиента, Создание клиента1**: URL и учётные данные должны браться из `body.serverIP`, `body.serverPort`, `body.randompath`, `body.xuiUsername`, `body.xuiPassword` (сейчас часть узлов захардкожена — см. правки ниже).
- **addClient body**: `body.inboundId`, `body.userUuid`, `body.email` или `body.subscriptionDetails.userName`, `body.limitIp` или `body.subscriptionDetails.devices`, `body.totalGB`, `body.subscriptionDetails.period.expiryDate3xui`, `body.subId`.
- **Edit Fields / Edit Fields5**: `body.subId`, `body.subscriptionDetails.period.expiryDateUnix` или дата из Code10.

---

## 2. Delete client (`operation === 'delete_client'`)

### Отправляем

| Поле | Тип | Описание |
|------|-----|----------|
| `operation` | string | `"delete_client"` |
| `serverIP`, `serverPort`, `randompath` | | URL панели |
| `xuiUsername`, `xuiPassword` | | Для узла Login |
| `inboundId` | number/string | ID инбаунда |
| `clientId` | string | UUID клиента для удаления |

### Что читает workflow

- **Login**: URL = `https://{{ body.serverIP }}:{{ body.serverPort }}{{ body.randompath }}login` (без пробела перед `login`), body = username/password из body.
- **удаление**: URL = `https://{{ body.serverIP }}:{{ body.serverPort }}{{ body.randompath }}panel/api/inbounds/{{ body.inboundId }}/delClient/{{ body.clientId }}`, Cookie из ответа Login.

---

## 3. Update client (`category === 'update_subscription'`)

### Отправляем

| Поле | Тип | Описание |
|------|-----|----------|
| `category` | string | `"update_subscription"` |
| `clientId` | string | UUID клиента |
| `userUuid` | string | То же, что clientId |
| `email` | string | Email в 3x-ui |
| `limitIp`, `totalGB`, `expiryTime` | number | Обновляемые поля |
| `subId` | string | |
| `inboundId` | number | ID инбаунда |
| `serverIP`, `serverPort`, `randompath`, `xuiUsername`, `xuiPassword` | | Для Login6 |

### Что читает workflow

- **Login6**: URL и учётные данные из body (сейчас пароль захардкожен — заменить на body).
- **Создание клиента2**: URL = `.../panel/api/inbounds/updateClient/{{ body.clientId }}`, body = id (inboundId), settings (clients с userUuid, email, limitIp, totalGB, expiryTime, subId).

---

## 4. Ошибки в текущем workflow (исправления)

1. **Login (удаление)**: в URL указано `{{ $json.body.randompath }}login ` — лишний пробел перед закрывающей кавычкой; лучше `}}/login` или `}}login` без пробела.
2. **Login 178**: захардкожены URL `https://85.192.25.201:40910/KolbUBTWA0/login` и jsonBody с логином/паролем — заменить на подстановки из `$('Webhook').item.json.body` (serverIP, serverPort, randompath, xuiUsername, xuiPassword).
3. **Login3**: то же — заменить на body.
4. **Создание клиента**: захардкожен URL `https://85.192.25.201:40910/KolbUBTWA0/panel/api/inbounds/addClient` — собирать из body.serverIP, serverPort, randompath.
5. **Создание клиента1**: захардкожен URL — собирать из body.
6. **Login6**: jsonBody с паролем захардкожен — использовать body.xuiUsername и body.xuiPassword.
7. **Switch**: в условиях опечатки — `" CONFIRMED"` (пробел), `"=verifyPayment"` (лишний `=`), `" get_user_data"` (пробел); при необходимости привести к значениям без пробелов/равенства в начале.

Ниже приведены конкретные подстановки для узлов (значения в формате n8n выражений).

---

## 5. Подстановки в узлах workflow (как раньше — всё из body)

### Login (удаление клиента)

- **URL**: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}login`
- **jsonBody**: `={"username": "{{ $('Webhook').item.json.body.xuiUsername }}", "password": "{{ $('Webhook').item.json.body.xuiPassword }}"}`
- Убрать пробел в конце пути `login ` → `login`.

### Login 178 (MULTI — создание клиента)

- **URL**: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}login`
- **jsonBody**: `={"username": "{{ $('Webhook').item.json.body.xuiUsername }}", "password": "{{ $('Webhook').item.json.body.xuiPassword }}"}`

### Создание клиента (MULTI)

- **URL**: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}panel/api/inbounds/addClient`
- **jsonBody** оставить как есть (уже из body):
  - `id`: `{{ $('Webhook').item.json.body.inboundId }}`
  - `settings`: clients с `userUuid`, `subscriptionDetails.userName`, `subscriptionDetails.devices`, `subscriptionDetails.period.expiryDate3xui`, `subId`
- **jsonHeaders**: Cookie из предыдущего узла (Login 178): `{{ $json.headers["set-cookie"][0] }}`

### Code10 → Login3 → Создание клиента1 (Super)

- **Login3**  
  - **URL**: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}login`  
  - **jsonBody**: `={"username": "{{ $('Webhook').item.json.body.xuiUsername }}", "password": "{{ $('Webhook').item.json.body.xuiPassword }}"}`
- **Создание клиента1**  
  - **URL**: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}panel/api/inbounds/addClient`  
  - **jsonBody**: без изменений (уже использует Webhook body: inboundId, userUuid, email, limitIp, totalGB, subscriptionDetails.period.expiryDate3xui, subId).  
  - **jsonHeaders**: Cookie от Login3: `{{ $json.headers["set-cookie"][0] }}`

### Login6 → Создание клиента2 (update_subscription)

- **Login6**  
  - **URL**: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}login`  
  - **jsonBody**: `={"username": "{{ $('Webhook').item.json.body.xuiUsername }}", "password": "{{ $('Webhook').item.json.body.xuiPassword }}"}`
- **Создание клиента2**  
  - **URL**: уже из body: `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}panel/api/inbounds/updateClient/{{ $('Webhook').item.json.body.clientId }}`  
  - **jsonBody**: уже из body (id, settings с userUuid, email, limitIp, totalGB, expiryTime, subId).  
  - **jsonHeaders**: Cookie от Login6: `{{ $json.headers["set-cookie"][0] }}`

### Удаление (delete_client)

- **URL** уже из body:  
  `=https://{{ $('Webhook').item.json.body.serverIP }}:{{ $('Webhook').item.json.body.serverPort }}{{ $('Webhook').item.json.body.randompath }}panel/api/inbounds/{{ $('Webhook').item.json.body.inboundId }}/delClient/{{ $('Webhook').item.json.body.clientId }}`
- **jsonHeaders**: Cookie от узла Login: `{{ $json.headers["set-cookie"][0] }}`

### Edit Fields (MULTI) — KEY

- Ссылку на подписку можно оставить из body, если фронт пришлёт поле (например `subscriptionBaseLink`). Сейчас в workflow:  
  `https://sub.skypath.fun:8671/vk098/{{ $('Webhook').item.json.body.subId }}`  
  Если базовый URL хранится в настройках/тарифе, можно добавить в payload поле `subscriptionBaseLink` и здесь использовать:  
  `={{ $('Webhook').item.json.body.subscriptionBaseLink || 'https://sub.skypath.fun:8671/vk098/' }}{{ $('Webhook').item.json.body.subId }}`

### Edit Fields5 (Super)

- KEY сейчас захардкожен; по аналогии с MULTI при наличии `subscriptionBaseLink` в body:  
  `={{ $('Webhook').item.json.body.subscriptionBaseLink || 'https://subs.skypath.fun:3458/vk198/' }}`  
  ПодпискаДо: оставить `{{ $('Code10').item.json.formattedDate }}` или при необходимости `{{ $('Webhook').item.json.body.subscriptionDetails.period.expiryDateUnix }}`.

---

## 6. Проверка отправляемых данных (frontend)

В `dashboardService.js` при формировании `operationData` уже передаются:

- `serverIP`, `serverPort`, `randompath`, `protocol`
- `xuiUsername`, `xuiPassword` (если нет sessionCookie)
- `inboundId`, `clientId`, `userUuid`, `email`, `limitIp`, `totalGB`, `expiryTime`, `subId`
- `subscriptionDetails`: `tariffName`, `devices`, `userName`, `profileUuid`, `period.expiryDate3xui`, `period.expiryDateUnix`, `period.expiryDateIso`, `period.months`

Этого достаточно для описанных выше подстановок в workflow. Для разных серверов/тарифов достаточно, чтобы в body подставлялись данные выбранного сервера (как сейчас).

---

## 7. Условия Switch (маршрутизация)

В workflow в узле **Switch** используются:

- `body.operation` = `"add_client"` — добавление клиента
- `body.mode` = `"generateLink"` | `"verifyPayment"` | `"createPayment"`
- `body.operation` = `"delete_client"` — удаление
- `body.status` = `"CONFIRMED"` (в JSON указано `" CONFIRMED"` с пробелом — при несовпадении убрать пробел)
- `body.mode` = `"verifyPayment"` (в JSON указано `"=verifyPayment"` с `=` — при несовпадении убрать `=`)
- `body.category` = `"get_user_data"` (в JSON `" get_user_data"` с пробелом — при несовпадении убрать пробел)
- `body.category` = `"update_subscription"` — обновление подписки

Backend отправляет `operation: 'add_client'`, `operation: 'delete_client'`, `category: 'new_subscription'` и т.д. без лишних пробелов и символов. Если ветки не срабатывают, в n8n в условиях Switch привести `rightValue` к этим значениям (без пробела и без `=` в начале).
