# Публичные отзывы: настройка бэкенда

Чтобы форма «Оставить отзыв» (/#review) работала и отзывы попадали на модерацию в админ-панель, **бэкенд** (сервер, который обрабатывает `/api`) должен иметь доступ к Firestore через Firebase Admin SDK.

## Ошибка «Сервис отзывов временно недоступен»

Она появляется, когда сервер получает запрос `POST /api/public/review`, но **Firestore (db) не инициализирован** — обычно из‑за отсутствия переменных окружения Firebase Admin.

## Что сделать на сервере

1. **Запускается ли у вас n8n-webhook-proxy (или другой сервер с маршрутом `/api/public/review`)?**  
   Запросы с фронта идут на тот же хост, что и сайт, по пути `/api/...`. Прокси (nginx и т.п.) должны направлять `/api` на процесс, в котором запущен этот сервер.

2. **В каталоге/окружении, откуда запускается этот сервер, задайте переменные Firebase Admin.**

   В `server/.env` (или в переменных окружения процесса) должны быть заданы:

   - **FIREBASE_PROJECT_ID** — ID проекта Firebase (тот же, что во фронтенде, например `skypathvpn`).

   И один из вариантов учётных данных:

   - **Вариант A.** Одна переменная с JSON ключа сервисного аккаунта:
     - **FIREBASE_SERVICE_ACCOUNT_KEY** — строка JSON (весь ключ из Firebase Console → Project settings → Service accounts → Generate new private key).

   - **Вариант B.** Две переменные:
     - **FIREBASE_CLIENT_EMAIL** — `firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com`
     - **FIREBASE_PRIVATE_KEY** — приватный ключ в кавычках, с символами `\n` в месте переносов строк.

   Пример `.env` на сервере:

   ```env
   FIREBASE_PROJECT_ID=skypathvpn
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"skypathvpn",...}
   ```

   Или:

   ```env
   FIREBASE_PROJECT_ID=skypathvpn
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@skypathvpn.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. **Перезапустите сервер** после изменения `.env` или переменных окружения.

После этого при отправке отзыва с формы:

- бэкенд создаёт документ в Firestore в коллекции отзывов со статусом `pending`;
- в админ-панели во вкладке **«Отзывы»** этот отзыв появляется на модерации;
- после одобрения он отображается на главной в блоке отзывов.

## Где взять ключ сервисного аккаунта

1. [Firebase Console](https://console.firebase.google.com/) → ваш проект.
2. ⚙️ Project settings → вкладка **Service accounts**.
3. **Generate new private key** → скачивается JSON.
4. Либо задайте **FIREBASE_SERVICE_ACCOUNT_KEY** строкой этого JSON, либо возьмите из файла `client_email` и `private_key` и задайте **FIREBASE_CLIENT_EMAIL** и **FIREBASE_PRIVATE_KEY**.

Ключ храните только на сервере, не добавляйте в репозиторий и не отдавайте на фронт.
