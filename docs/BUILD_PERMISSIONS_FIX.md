# Исправление ошибки EACCES при сборке (Vite build)

## Проблема

При запуске `npm run build` на сервере возникает ошибка:

```text
[vite:prepare-out-dir] EACCES: permission denied, unlink '/opt/my-frontend/dist/assets/firebase-DGxBeqBb.js'
```

Она появляется, когда папка `dist` или файлы в ней принадлежат другому пользователю (например, root или другому процессу), и текущий пользователь не может удалять их при очистке перед сборкой.

## Решение на сервере

Выполните команды **на сервере** (где путь `/opt/my-frontend` и пользователь `skyputh`).

### Вариант 1: Выдать права текущему пользователю (рекомендуется)

Подставьте свой пользователь, от которого запускаете `npm run build` (в примере — `skyputh`):

```bash
sudo chown -R skyputh:skyputh /opt/my-frontend/dist
```

Затем снова запустите сборку:

```bash
cd /opt/my-frontend
npm run build
```

### Вариант 2: Удалить dist и собрать заново

Если старый `dist` не нужен:

```bash
sudo rm -rf /opt/my-frontend/dist
cd /opt/my-frontend
npm run build
```

Новая папка `dist` будет создана уже от имени текущего пользователя.

### Вариант 3: Скрипт из репозитория

Из корня проекта на сервере:

```bash
cd /opt/my-frontend
sudo bash scripts/fix-dist-permissions.sh /opt/my-frontend skyputh skyputh
```

После этого запускайте сборку без sudo:

```bash
npm run build
```

## Чтобы проблема не повторялась

1. **Не запускайте сборку от root**  
   Всегда выполняйте `npm run build` от того же пользователя, под которым крутится приложение (например, `skyputh`).

2. **Docker**  
   Если сборка идёт в контейнере, убедитесь, что образ не создаёт `dist` от root, или в `Dockerfile` после сборки выполните:
   ```dockerfile
   RUN chown -R node:node /app/dist
   ```
   (или ваш пользователь/группа вместо `node:node`.)

3. **CI/CD**  
   В пайплайне собирайте проект от того же пользователя, который потом владеет файлами на сервере, или после сборки явно делайте `chown` на `dist`.

## Кратко

На сервере один раз выполните:

```bash
sudo chown -R skyputh:skyputh /opt/my-frontend/dist
```

заменив `skyputh` на пользователя, от которого вы запускаете `npm run build`. После этого `npm run build` должен проходить без EACCES.
