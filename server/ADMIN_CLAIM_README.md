# Установка admin claim на сервере

В папке **server/** есть два варианта скрипта:

- **set-admin-claim.cjs** — CommonJS, запускается как `node set-admin-claim.cjs` (рекомендуется на сервере).
- **set-admin-claim.js** — ESM, нужен `"type": "module"` в package.json.

## Если скрипта нет на сервере

Файл может не попадать при деплое. Тогда его нужно скопировать на сервер.

### Вариант 1: с локальной машины по SCP

На компьютере, где лежит репозиторий (не на сервере):

```bash
scp server/set-admin-claim.cjs skyputh@skyputh:/opt/my-frontend/server/
```

Подставьте свой пользователь и хост, если отличаются (например `user@your-server.com`).

### Вариант 2: git pull на сервере

Если на сервере есть полный клон репозитория:

```bash
cd /opt/my-frontend
git pull origin main
```

После этого в `server/` должны появиться `set-admin-claim.cjs` и/или `set-admin-claim.js`.

### Вариант 3: создать файл вручную на сервере

На сервере:

```bash
cd /opt/my-frontend/server
nano set-admin-claim.cjs
```

Вставьте содержимое файла `server/set-admin-claim.cjs` из репозитория, сохраните (Ctrl+O, Enter, Ctrl+X).

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
