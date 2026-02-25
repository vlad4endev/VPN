# Справочник HTTP-запросов к 3X-UI API

Документация API: https://documenter.getpostman.com/view/5146551/2sB3QCTuB6

## Переменные

| Переменная     | Пример        | Описание |
|----------------|---------------|----------|
| `HOST`         | `localhost`   | IP или домен панели |
| `PORT`         | `2053`        | Порт панели |
| `WEBBASEPATH`  | `/` или `/randompath` | Базовый путь (без завершающего `/`) |
| `inboundId`    | `1`           | ID инбаунда |
| `uuid`         | `a1b2c3d4-...`| UUID клиента (VLESS/VMESS) |
| `email`        | `user@example.com` | Email клиента (без пробелов, пробелы → `_`) |
| `count`        | `100`         | Количество строк логов |
| `bearerToken`  | —             | Токен (если панель поддерживает) |
| `sessionCookie`| `3x-ui=...`   | Сессионная cookie после POST /login |

**Базовый URL:**
```
BASE = "http://{HOST}:{PORT}{WEBBASEPATH}"
# Пример: http://localhost:2053/randompath
```

Авторизация: обычно **Cookie** после логина; при необходимости — `Authorization: Bearer {{bearerToken}}`.

---

## 1. GET /panel/api/inbounds/get/{inboundId}

Получить инбаунд по ID.

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`, `inboundId`

### curl
```bash
curl -X GET "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/inbounds/get/{{inboundId}}" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}"
```

### Python (requests)
```python
import requests

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
url = f"{BASE}/panel/api/inbounds/get/{inboundId}"
headers = {"Accept": "application/json"}
if session_cookie:
    headers["Cookie"] = session_cookie
# Альтернатива: headers["Authorization"] = f"Bearer {bearer_token}"

r = requests.get(url, headers=headers, timeout=30)
r.raise_for_status()
data = r.json()
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "obj": {
    "id": 1,
    "enable": true,
    "remark": "VLESS TCP",
    "listen": "",
    "port": "443",
    "protocol": "vless",
    "settings": "{\"clients\":[...],\"decryption\":\"none\"}",
    "streamSettings": {},
    "sniffing": {},
    "tag": "inbound-1",
    "clients": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "email": "user@example.com",
        "totalGB": 32212254720,
        "expiryTime": 1735689600000,
        "enable": true,
        "up": 0,
        "down": 0
      }
    ]
  }
}
```

---

## 2. GET /panel/api/inbounds/getClientTraffics/{email}

Трафик клиента по email.

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`, `email` (URL-encode; пробелы в email заменять на `_`)

### curl
```bash
EMAIL_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('{{email}}'))")
curl -X GET "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/inbounds/getClientTraffics/${EMAIL_ENCODED}" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}"
```

### Python (requests)
```python
import requests
from urllib.parse import quote

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
email_safe = (email or "").strip().replace(" ", "_")
email_encoded = quote(email_safe, safe="")
url = f"{BASE}/panel/api/inbounds/getClientTraffics/{email_encoded}"
headers = {"Accept": "application/json"}
if session_cookie:
    headers["Cookie"] = session_cookie

r = requests.get(url, headers=headers, timeout=30)
r.raise_for_status()
data = r.json()
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "obj": {
    "email": "user@example.com",
    "up": 1024000,
    "down": 2048000,
    "total": 32212254720,
    "expiryTime": 1735689600000
  }
}
```

---

## 3. GET /panel/api/inbounds/getClientTrafficsById/{uuid}

Трафик клиента по UUID.

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`, `uuid`

### curl
```bash
curl -X GET "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/inbounds/getClientTrafficsById/{{uuid}}" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}"
```

### Python (requests)
```python
import requests

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
uuid_encoded = requests.utils.quote(str(uuid), safe="")
url = f"{BASE}/panel/api/inbounds/getClientTrafficsById/{uuid_encoded}"
headers = {"Accept": "application/json"}
if session_cookie:
    headers["Cookie"] = session_cookie

r = requests.get(url, headers=headers, timeout=30)
r.raise_for_status()
data = r.json()
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "obj": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "up": 1024000,
    "down": 2048000,
    "total": 32212254720,
    "expiryTime": 1735689600000
  }
}
```

---

## 4. POST /panel/api/inbounds/addClient — создание клиента

Добавить клиента в инбаунд. Перед вызовом нужна авторизация (Cookie).

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`, `inboundId`, `userUuid`, `email`, `limitIp`, `totalGB`, `expiryTime`, `subId`, `sessionCookie`

**Важно:** в 3x-ui `totalGB` передаётся **в байтах**; `expiryTime` — **в миллисекундах** (Unix × 1000). Email без пробелов (пробелы → `_`).

### Тело запроса (JSON)

- `id` — ID инбаунда (число).
- `settings` — строка JSON с объектом `{ "clients": [ { ... } ] }`. В каждом элементе `clients`: `id` (UUID), `flow`, `email`, `limitIp`, `totalGB`, `expiryTime`, `enable`, `tgId`, `subId`, `reset`.

### curl
```bash
# Подставьте свои значения
INBOUND_ID=6
USER_UUID="3d7991db-e555-4c9d-b906-9144e0cfd50a"
EMAIL="user@example.com"
LIMIT_IP=2
TOTAL_GB_BYTES=32212254720
EXPIRY_MS=1735689600000
SUB_ID="tk8klp8x23fovd85"

SETTINGS="{\"clients\":[{\"id\":\"${USER_UUID}\",\"flow\":\"xtls-rprx-vision\",\"email\":\"${EMAIL}\",\"limitIp\":${LIMIT_IP},\"totalGB\":${TOTAL_GB_BYTES},\"expiryTime\":${EXPIRY_MS},\"enable\":true,\"tgId\":\" \",\"subId\":\"${SUB_ID}\",\"reset\":0}]}"

curl -X POST "https://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/inbounds/addClient" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Cookie: {{sessionCookie}}" \
  -d "{\"id\":${INBOUND_ID},\"settings\":$(echo "\"$SETTINGS\"")}"
```

### Python (requests)
```python
import json
import requests

BASE = f"https://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
url = f"{BASE}/panel/api/inbounds/addClient"
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
}
if session_cookie:
    headers["Cookie"] = session_cookie

# totalGB в байтах, expiryTime в миллисекундах
client = {
    "id": user_uuid,
    "flow": "xtls-rprx-vision",
    "email": email.strip().replace(" ", "_"),
    "limitIp": limit_ip,
    "totalGB": total_gb_bytes,
    "expiryTime": expiry_time_ms,
    "enable": True,
    "tgId": " ",
    "subId": sub_id,
    "reset": 0,
}
body = {
    "id": inbound_id,
    "settings": json.dumps({"clients": [client]}),
}
r = requests.post(url, headers=headers, json=body, timeout=30, verify=False)
r.raise_for_status()
data = r.json()
```

### Пример тела (JSON) для n8n / Postman
```json
{
  "id": 6,
  "settings": "{\"clients\": [{\"id\": \"3d7991db-e555-4c9d-b906-9144e0cfd50a\", \"flow\": \"xtls-rprx-vision\", \"email\": \"user@example.com\", \"limitIp\": 2, \"totalGB\": 32212254720, \"expiryTime\": 1735689600000, \"enable\": true, \"tgId\": \" \", \"subId\": \"tk8klp8x23fovd85\", \"reset\": 0}]}"
}
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "msg": "Client added"
}
```

---

## 5. POST /panel/api/server/xraylogs/{count}

Получить последние N строк логов X-Ray.

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`, `count`

### curl
```bash
curl -X POST "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/server/xraylogs/{{count}}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}" \
  -d '{}'
```

### Python (requests)
```python
import requests

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
url = f"{BASE}/panel/api/server/xraylogs/{count}"
headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
}
if session_cookie:
    headers["Cookie"] = session_cookie

r = requests.post(url, headers=headers, json={}, timeout=30)
r.raise_for_status()
data = r.json()
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "obj": "2024-01-15 10:00:00 [Info] ...\n2024-01-15 10:00:01 [Info] ..."
}
```

---

## 6. POST /panel/api/server/importDB

Импорт базы данных (тело — по документации панели: часто multipart/form-data с файлом или JSON с путём).

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`

### curl (JSON body, если API принимает)
```bash
curl -X POST "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/server/importDB" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}" \
  -d '{}'
```

### curl (multipart, если нужен файл)
```bash
curl -X POST "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/server/importDB" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}" \
  -F "file=@/path/to/backup.db"
```

### Python (requests) — JSON
```python
import requests

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
url = f"{BASE}/panel/api/server/importDB"
headers = {"Content-Type": "application/json", "Accept": "application/json"}
if session_cookie:
    headers["Cookie"] = session_cookie

r = requests.post(url, headers=headers, json={}, timeout=60)
r.raise_for_status()
data = r.json()
```

### Python (requests) — файл
```python
with open("/path/to/backup.db", "rb") as f:
    files = {"file": ("backup.db", f, "application/octet-stream")}
    r = requests.post(url, headers={"Accept": "application/json", "Cookie": session_cookie}, files=files, timeout=60)
r.raise_for_status()
data = r.json()
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "msg": "Database imported successfully"
}
```

---

## 7. POST /panel/api/server/getNewEchCert

Получить новый ECH-сертификат.

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`. Тело — по документации (часто пустой объект или параметры домена).

### curl
```bash
curl -X POST "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/panel/api/server/getNewEchCert" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Cookie: {{sessionCookie}}" \
  -d '{}'
```

### Python (requests)
```python
import requests

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
url = f"{BASE}/panel/api/server/getNewEchCert"
headers = {"Content-Type": "application/json", "Accept": "application/json"}
if session_cookie:
    headers["Cookie"] = session_cookie

r = requests.post(url, headers=headers, json={}, timeout=60)
r.raise_for_status()
data = r.json()
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "obj": {},
  "msg": "Certificate generated"
}
```

---

## 8. POST /login — авторизация (получение Cookie)

Используется для получения `sessionCookie` для последующих запросов.

**Подставляемые данные:** `HOST`, `PORT`, `WEBBASEPATH`, `username`, `password`

### curl (form)
```bash
curl -X POST "http://{{HOST}}:{{PORT}}{{WEBBASEPATH}}/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Accept: application/json" \
  -d "username={{username}}&password={{password}}" \
  -c cookies.txt -v
```

### Python (requests)
```python
import requests

BASE = f"http://{HOST}:{PORT}{WEBBASEPATH}".rstrip("/")
url = f"{BASE}/login"
r = requests.post(
    url,
    data={"username": username, "password": password},
    headers={"Accept": "application/json"},
    timeout=10,
)
r.raise_for_status()
# Cookie сохраняется в r.cookies; для следующих запросов:
session_cookie = "; ".join(f"{c.name}={c.value}" for c in r.cookies)
# или передавать session=r (requests.Session()) и использовать session.get/post
```

### Пример успешного ответа (200 OK)
```json
{
  "success": true,
  "msg": "Login successful"
}
```
Заголовок ответа: `Set-Cookie: 3x-ui=...; Path=/; ...`

---

## 9. Дополнительные эндпоинты (кратко)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/panel/api/inbounds/list` | Список инбаундов |
| GET | `/panel/api/inbounds` | То же (альтернатива) |
| GET | `/panel/api/server/status` | Статус сервера |
| GET | `/panel/api/server/getNewUUID` | Новый UUID |
| GET | `/panel/api/server/getXrayVersion` | Версия Xray |
| GET | `/panel/api/clients/{clientId}/stats` | Статистика клиента по UUID |
| POST | `/panel/api/inbounds/addClient` | Добавить клиента (body: id, settings) |
| POST | `/panel/api/inbounds/updateClient/{clientId}` | Обновить клиента |
| POST | `/panel/api/inbounds/{id}/delClient/{clientId}` | Удалить клиента |
| POST | `/panel/api/inbounds/{id}/delClientByEmail/{email}` | Удалить по email |
| POST | `/panel/api/inbounds/{id}/resetClientTraffic/{email}` | Сброс трафика |
| POST | `/panel/api/server/restartXrayService` | Перезапуск Xray |

Формат тела для `addClient`/`updateClient` и примеры ответов — см. `server/lib/xuiClient.js` и официальную документацию 3X-UI.

---

## Общий шаблон для вставки в проект (Python)

```python
import os
import requests
from urllib.parse import quote

HOST = os.getenv("XUI_HOST", "localhost").replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
PORT = os.getenv("XUI_PORT", "2053")
WEBBASEPATH = os.getenv("XUI_WEBBASEPATH", "/")
USERNAME = os.getenv("XUI_USERNAME", "")
PASSWORD = os.getenv("XUI_PASSWORD", "")

def base_url():
    path = WEBBASEPATH.rstrip("/")
    return f"http://{HOST}:{PORT}{path}"

def login():
    r = requests.post(
        f"{base_url()}/login",
        data={"username": USERNAME, "password": PASSWORD},
        headers={"Accept": "application/json"},
        timeout=10,
    )
    r.raise_for_status()
    return r.cookies

def get_inbound(session, inbound_id):
    r = session.get(f"{base_url()}/panel/api/inbounds/get/{inbound_id}", timeout=30)
    r.raise_for_status()
    return r.json()

def get_client_traffics_by_email(session, email):
    email_safe = (email or "").strip().replace(" ", "_")
    path = quote(f"getClientTraffics/{email_safe}", safe="/")
    r = session.get(f"{base_url()}/panel/api/inbounds/{path}", timeout=30)
    r.raise_for_status()
    return r.json()

def get_client_traffics_by_id(session, uuid):
    r = session.get(
        f"{base_url()}/panel/api/inbounds/getClientTrafficsById/{quote(str(uuid), safe='')}",
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

def get_xray_logs(session, count=100):
    r = session.post(
        f"{base_url()}/panel/api/server/xraylogs/{count}",
        headers={"Content-Type": "application/json"},
        json={},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

# Использование:
# session = requests.Session()
# session.cookies.update(login())
# data = get_inbound(session, 1)
# data = get_client_traffics_by_id(session, "a1b2c3d4-...")
```

Все запросы используют только подставляемые переменные и готовы к копированию в проект.
