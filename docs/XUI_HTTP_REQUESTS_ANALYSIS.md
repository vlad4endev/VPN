# Анализ HTTP-запросов 3x-ui на соответствие документации

Сверка запросов из раздела **«HTTP запросы (3x-ui)»** и `server/lib/xuiClient.js` с локальной документацией `docs/3XUI_HTTP_REFERENCE.md` и официальной документацией 3x-ui (Postman: https://documenter.getpostman.com/view/5146551/2sB3QCTuB6).

---

## Итог: запросы в целом правильные

Все пути и методы соответствуют документации. Есть несколько замечаний по формату тела и кодированию параметров в URL.

---

## По каждому запросу

| # | ID в панели | Метод | Путь | Документация | Статус |
|---|-------------|--------|------|--------------|--------|
| 1 | login | POST | `/login` | POST /login, тело: username, password (form или JSON) | ✅ Путь верный. В справочнике указан **form data**; панель по умолчанию шлёт **JSON**. Многие версии 3x-ui принимают оба варианта. |
| 2 | inbounds-list | GET | `/panel/api/inbounds/list` | GET /panel/api/inbounds/list | ✅ |
| 3 | inbounds | GET | `/panel/api/inbounds` | GET /panel/api/inbounds | ✅ |
| 4 | inbound-get | GET | `/panel/api/inbounds/get/{{inboundId}}` | GET /panel/api/inbounds/get/{inboundId} | ✅ |
| 5 | client-traffics | GET | `/panel/api/inbounds/getClientTraffics/{{email}}` | GET /panel/api/inbounds/getClientTraffics/{email} | ✅ Путь верный. **Email должен быть URL-encoded** (например `user@example.com` → `user%40example.com`). |
| 6 | client-traffics-by-id | GET | `/panel/api/inbounds/getClientTrafficsById/{{uuid}}` | GET /panel/api/inbounds/getClientTrafficsById/{uuid} | ✅ Путь верный. Рекомендуется **кодировать uuid** в URL. |
| 7 | add-client | POST | `/panel/api/inbounds/addClient` | POST /panel/api/inbounds/addClient, body: id (число), settings (JSON-строка) | ✅ Формат body совпадает: id, settings с массивом clients (id, email, flow, limitIp, totalGB, expiryTime, enable, tgId, subId, reset, up, down). totalGB — в байтах, expiryTime — в мс. |
| 8 | update-client | POST | `/panel/api/inbounds/updateClient/{{clientId}}` | POST /panel/api/inbounds/updateClient/{clientId}, body: id, settings | ✅ |
| 9 | del-client | POST | `/panel/api/inbounds/{{inboundId}}/delClient/{{clientId}}` | POST /panel/api/inbounds/{id}/delClient/{clientId} | ✅ |
| 10 | del-client-by-email | POST | `/panel/api/inbounds/{{inboundId}}/delClientByEmail/{{email}}` | POST /panel/api/inbounds/{id}/delClientByEmail/{email} | ✅ Путь верный. **Email в URL нужно кодировать**. |
| 11 | client-stats | GET | `/panel/api/clients/{{clientId}}/stats` | GET /panel/api/clients/{clientId}/stats | ✅ |
| 12 | server-status | GET | `/panel/api/server/status` | GET /panel/api/server/status | ✅ |
| 13 | get-new-uuid | GET | `/panel/api/server/getNewUUID` | GET /panel/api/server/getNewUUID | ✅ |
| 14 | xray-version | GET | `/panel/api/server/getXrayVersion` | GET /panel/api/server/getXrayVersion | ✅ |
| 15 | restart-xray | POST | `/panel/api/server/restartXrayService` | POST /panel/api/server/restartXrayService | ✅ |
| 16 | reset-traffic | POST | `/panel/api/inbounds/{{inboundId}}/resetClientTraffic/{{email}}` | POST /panel/api/inbounds/{id}/resetClientTraffic/{email} | ✅ Путь верный. **Email в URL нужно кодировать**. |

---

## Замечания и рекомендации

### 1. Кодирование email и uuid в пути

В документации и в `xuiClient.js` для путей с **email** и **uuid** используется кодирование:

- `getClientTraffics/:email` — `encodeURIComponent(normalizeEmail(email))`
- `getClientTrafficsById/:uuid` — `encodeURIComponent(uuid)`
- `delClientByEmail/:email`, `resetClientTraffic/:email` — то же для email

В панели «HTTP запросы» подстановка `{{email}}` и `{{uuid}}` в path делается без кодирования. При email вида `user@example.com` путь может стать некорректным. Рекомендация: при подстановке в path кодировать значения для переменных `email`, `uuid`, `clientId` (например, через `encodeURIComponent`).

### 2. Логин: form vs JSON

- Справочник и `xuiClient.js`: логин через **application/x-www-form-urlencoded** (form).
- В панели по умолчанию тело — **JSON**.

Если панель 3x-ui не примет JSON, админ может вручную изменить тело запроса на form (или использовать один и тот же endpoint с form в панели). Имеет смысл в подсказке в интерфейсе указать, что для логина предпочтителен form.

### 3. addClient: тип поля `id`

В body для addClient в документации и в `xuiClient.js` поле `id` — **число** (inboundId). В шаблоне панели подставляется `{{inboundId}}` (строка). При отправке на бэкенд лучше приводить `id` к числу (как в xuiClient: `Number(inboundId)`), чтобы не зависеть от того, как конкретная версия 3x-ui обрабатывает строковый id.

### 4. Дополнительные эндпоинты из документации

В `docs/3XUI_HTTP_REFERENCE.md` и в `xuiClient.js` есть эндпоинты, которые можно при желании добавить в панель:

- `POST /panel/api/server/xraylogs/{count}` — логи Xray
- `POST /panel/api/server/importDB` — импорт БД
- `POST /panel/api/server/getNewEchCert` — новый ECH-сертификат

Они не обязательны для базового набора «HTTP запросы», но соответствуют документации.

---

## Вывод

Запросы в разделе «HTTP запросы (3x-ui)» и в `server/lib/xuiClient.js` **соответствуют документации** по путям и методам. Рекомендуется:

1. В панели при подстановке в path кодировать `email`, `uuid` и при необходимости `clientId` через `encodeURIComponent`.
2. В подсказке для логина указать предпочтение form body.
3. При отправке addClient приводить `id` в body к числу.

После этих правок поведение будет полностью совпадать с документацией и с реализацией в `xuiClient.js`.
