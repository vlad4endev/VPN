# Ошибка 400 (auth/invalid-credential) при входе по email

При входе по email и паролю запрос к `identitytoolkit.googleapis.com/v1/accounts:signInWithPassword` может вернуть **400 Bad Request** и в приложении — **Firebase: Error (auth/invalid-credential)**.

## Что проверить в Firebase Console

1. **Включён ли провайдер «Пароль (Email/Password)»**
   - [Firebase Console](https://console.firebase.google.com/) → ваш проект (skypathvpn) → **Authentication** → вкладка **Sign-in method**.
   - Найдите **«Пароль (Email/Password)»** (или Email/Password).
   - Включите переключатель **Enable** и при необходимости **Email link** (если используете вход по ссылке).
   - Сохраните.

2. **Есть ли пользователь с таким email**
   - **Authentication** → вкладка **Users**.
   - Проверьте, есть ли пользователь с email `vladislav4endev@gmail.com` (или тем, которым вы входите).
   - Если пользователя нет — создайте: **Add user** → укажите Email и пароль.
   - Если пользователь создавался через **Google** (Sign-in with Google), у него нет пароля: войти по паролю нельзя. Нужно либо входить через кнопку «Google», либо в консоли для этого пользователя нажать «…» → **Reset password** и задать пароль (если Firebase это позволяет для такого провайдера).

3. **Домен сайта в списке авторизованных**
   - **Authentication** → вкладка **Settings** → **Authorized domains**.
   - Убедитесь, что в списке есть домен, с которого вы входите, например:
     - `skypath.fun`
     - `www.skypath.fun`
     - `localhost` (для разработки)
   - При необходимости добавьте домен и сохраните.

4. **Ограничения API-ключа (если включены)**
   - [Google Cloud Console](https://console.cloud.google.com/) → ваш проект → **APIs & Services** → **Credentials** → найдите ключ с ID, который используется в приложении (например, по части `AIzaSy...` из ошибки).
   - Если для ключа заданы **Application restrictions** (HTTP referrers), добавьте туда ваши домены, например:
     - `https://skypath.fun/*`
     - `https://www.skypath.fun/*`
   - Если ограничения по API — только **Identity Toolkit API** (или Firebase Authentication API), убедитесь, что они не блокируют запросы с вашего домена.

## Что видит пользователь в приложении

При `auth/invalid-credential` в форме входа по email показывается сообщение из перевода **app.invalidCredentialEmail**, например:

- **RU:** «Неверный пароль или этот email привязан к Google. Войдите через кнопку «Google» или восстановите пароль ниже.»

То есть приложение не различает «неверный пароль» и «пользователь не найден» (так делает и Firebase для безопасности).

## Ошибка 503 от GET /api/auth/resolve-login

Если в консоли браузера видно **GET .../api/auth/resolve-login?q=... 503 (Service Unavailable)**:

- Сервер (n8n-webhook-proxy) не смог инициализировать **Firebase Admin** (Firestore). В этом случае `resolve-login` возвращает 503, но вход по **email** всё равно выполняется на клиенте (Firebase Auth). Ошибка 503 влияет только на поиск по логину.
- **Что проверить на сервере:**
  - Файл `server/firebase-service-account.json` существует и содержит валидный JSON сервисного аккаунта Firebase, **или**
  - Задана переменная окружения `FIREBASE_SERVICE_ACCOUNT_PATH` с путём к этому файлу, **или**
  - Заданы `GOOGLE_APPLICATION_CREDENTIALS` (путь к JSON).
  - Переменные `FIREBASE_PROJECT_ID` или `VITE_FIREBASE_PROJECT_ID` соответствуют проекту Firebase.
  - После добавления переменных/файла сервер перезапущен.
- При успешной инициализации в логах сервера при старте не должно быть предупреждения: «Telegram Mini App и админ-API будут возвращать 503 до настройки Firebase».

## Итог

- **400** приходит от Firebase, когда запрос доходит до сервера, но данные входа отклонены.
- **503** от `/api/auth/resolve-login` — Firebase Admin на бэкенде не инициализирован; вход по email при этом возможен, если ввести именно email.
- «Дай доступ» = включить Email/Password в Firebase, добавить пользователя (или задать пароль для существующего), проверить Authorized domains и при необходимости ограничения API-ключа.
- Если аккаунт создан через **Google** — входить через кнопку «Войти через Google» или задать пароль в Firebase Console (Users → … → Reset password).
