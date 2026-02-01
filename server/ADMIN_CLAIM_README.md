# Установка admin claim на сервере

В папке **server/** есть два варианта скрипта:

- **set-admin-claim.cjs** — CommonJS, запускается как `node set-admin-claim.cjs` (рекомендуется на сервере).
- **set-admin-claim.js** — ESM, нужен `"type": "module"` в package.json.

## Если скрипта нет на сервере

Файл может не попадать при деплое. Создать его на сервере можно так.

### Способ 1: установщик одной командой (рекомендуется)

На сервере выполните **одну из** команд ниже.

**Если репозиторий на GitHub** (подставьте `USER`, `REPO`, ветку при необходимости — например `main`):

```bash
cd /opt/my-frontend/server
curl -sL "https://raw.githubusercontent.com/USER/REPO/main/server/create-set-admin-claim.sh" -o create-set-admin-claim.sh
bash create-set-admin-claim.sh
node set-admin-claim.cjs --migrate
```

**Если доступа к GitHub нет** — скопируйте на сервер файл `server/create-set-admin-claim.sh` из репозитория (через scp, sftp или вставкой в nano), затем на сервере:

```bash
cd /opt/my-frontend/server
bash create-set-admin-claim.sh
node set-admin-claim.cjs --migrate
```

Скрипт `create-set-admin-claim.sh` создаёт в текущей папке файл `set-admin-claim.cjs`.

### Способ 2: scp с локальной машины

На компьютере, где лежит репозиторий (не на сервере):

```bash
scp server/set-admin-claim.cjs skyputh@skyputh:/opt/my-frontend/server/
```

Подставьте свой пользователь и хост при необходимости.

### Способ 3: git pull на сервере

Если на сервере есть полный клон репозитория:

```bash
cd /opt/my-frontend
git pull origin main
```

После этого в `server/` должны появиться `set-admin-claim.cjs` и `create-set-admin-claim.sh`.

---

## Запуск на сервере

```bash
cd /opt/my-frontend/server
node set-admin-claim.cjs --migrate
```

Или с полным путём:

```bash
node /opt/my-frontend/server/set-admin-claim.cjs --migrate
```

Используйте **.cjs** — так скрипт всегда запускается в режиме CommonJS и не зависит от `"type": "module"` в package.json.

## Требования

1. **firebase-service-account.json** в папке `server/`:
   ```
   /opt/my-frontend/server/firebase-service-account.json
   ```
   Либо переменная окружения:
   ```bash
   export FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-service-account.json
   node set-admin-claim.cjs --migrate
   ```

2. В `server/` установлены зависимости (в т.ч. `firebase-admin`):
   ```bash
   cd /opt/my-frontend/server && npm install
   ```

## Команды

```bash
# Мигрировать всех администраторов из Firestore
node set-admin-claim.cjs --migrate

# Установить admin claim одному пользователю
node set-admin-claim.cjs admin@example.com

# Информация о пользователе
node set-admin-claim.cjs --info admin@example.com
```
