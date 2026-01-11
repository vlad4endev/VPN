# SkyPuth VPN

Веб-интерфейс для VPN-сервиса SkyPuth с интеграцией Firebase и админ-панелью.

## Технологический стек

- **Frontend**: React 18, Vite
- **Стилизация**: Tailwind CSS
- **Иконки**: Lucide-React
- **Backend/Database**: Firebase Firestore
- **Auth**: Firebase Auth (Anonymously)
- **HTTP Client**: Axios
- **VPN Panel**: 3x-ui API integration

## Установка

1. Клонируйте репозиторий или скачайте проект

2. Установите зависимости:
```bash
npm install
```

3. Настройте переменные окружения:
   - Создайте файл `.env` в корне проекта
   - Заполните переменные окружения:
     ```
     # Firebase
     VITE_FIREBASE_API_KEY=your_api_key_here
     VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your_project_id
     VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     VITE_FIREBASE_APP_ID=your_app_id
     
     # 3x-ui API credentials (для использования в браузере)
     VITE_XUI_USERNAME=your_3xui_username
     VITE_XUI_PASSWORD=your_3xui_password
     VITE_XUI_INBOUND_ID=your_inbound_id
     
     # 3x-ui Proxy settings (для прокси-сервера Vite, только в dev режиме)
     XUI_HOST=http://your-server-ip:port
     # Опционально, если нужна базовая авторизация на уровне прокси:
     # XUI_USER=optional_proxy_username
     # XUI_PASS=optional_proxy_password
     ```
     
     **Важно**: 
     - `XUI_HOST` - адрес вашей панели 3x-ui (например, `http://192.168.1.100:2053`)
     - Прокси работает только в режиме разработки (`npm run dev`)
     - Для продакшена настройте прокси на уровне веб-сервера (nginx, Apache и т.д.)

4. Настройте Firestore:
   - Создайте коллекцию по пути: `/artifacts/skyputh/public/data/users_v4`
   - Структура документа:
     ```javascript
     {
       email: string,        // Уникальный логин
       password: string,     // Пароль
       uuid: string,        // Ключ VLESS (если пуст - доступа нет)
       role: 'admin' | 'user',
       plan: 'free' | 'premium',
       expiresAt: timestamp, // В миллисекундах
       createdAt: string     // ISO date string
     }
     ```

5. Настройте правила безопасности Firestore:
   - Разрешите анонимный доступ для чтения/записи коллекции `users_v4`
   - Или настройте правила согласно вашим требованиям безопасности

## Запуск

### Режим разработки
```bash
npm run dev
```

Приложение будет доступно по адресу `http://localhost:5173`

### Сборка для продакшена
```bash
npm run build
```

### Просмотр продакшен сборки
```bash
npm run preview
```

## Функциональность

### Личный кабинет
- Авторизация по email/password
- Регистрация новых пользователей
- Отображение карточки подключения "Нидерланды"
- Статусы подключения:
  - **Активен** (зеленый, пульсирующий) - если есть UUID и срок не истек
  - **Истек** (красный) - если срок действия истек
  - **Нет ключа** (серый) - если UUID пуст
- Модальное окно с полной VLESS конфигурацией
- Копирование UUID и конфигурации в буфер обмена

### Админ-панель
- Просмотр всех пользователей
- Отображение email, UUID, роли, плана, статуса и даты истечения
- Удаление пользователей (с подтверждением)
- Доступна только для пользователей с ролью `admin`

## Архитектура

Проект использует Single File Component подход - весь код находится в файле `src/VPNServiceApp.jsx`.

### Основные компоненты:
- `LoginForm` - форма входа/регистрации
- `Dashboard` - личный кабинет пользователя
- `KeyModal` - модальное окно с конфигурацией VLESS
- `AdminPanel` - админ-панель для управления пользователями

### Сервисы:
- `ThreeXUI` (`src/services/ThreeXUI.js`) - класс для работы с API 3x-ui панели:
  - `login()` - авторизация в панели 3x-ui
  - `addClient(inboundId, email, uuid)` - добавление клиента в инбаунд
  - `deleteClient(inboundId, email)` - удаление клиента из инбаунда
  - `getClientStats(email)` - получение статистики клиента (трафик, дата истечения)
  - `generateUUID()` - генерация UUID для VLESS
  - `createVLESSConfig(uuid, server, port)` - создание VLESS конфигурации
  
  Все запросы идут через относительный путь `/api/xui/*` для проксирования на сервер 3x-ui.

### Синхронизация Firestore и 3x-ui

Приложение автоматически синхронизирует данные между Firestore и панелью 3x-ui:

**При регистрации:**
1. Генерируется UUID для нового пользователя
2. Создается запись в Firestore
3. Создается клиент в панели 3x-ui через API
4. Если создание в 3x-ui не удалось - запись автоматически удаляется из Firestore

**При удалении пользователя:**
1. Удаляется клиент из панели 3x-ui
2. Удаляется запись из Firestore
3. Если удаление из 3x-ui не удалось - пользователь все равно удаляется из Firestore (с предупреждением в консоли)

**Требования:**
- `VITE_XUI_INBOUND_ID` - ID инбаунда в панели 3x-ui, в который будут добавляться клиенты

## Настройка прокси (Bypass CORS)

Проект использует прокси-сервер Vite для безопасного общения с панелью 3x-ui без раскрытия паролей админа в браузере.

### Режим разработки (Vite Dev Server)

Прокси настроен в `vite.config.js` и работает автоматически в режиме разработки:
- Все запросы к `/api/xui/*` перенаправляются на адрес, указанный в `XUI_HOST`
- Прокси обходит CORS ограничения
- Cookies сессии сохраняются автоматически

**Настройка:**
1. Укажите адрес панели 3x-ui в `.env`:
   ```
   XUI_HOST=http://your-server-ip:port
   ```
   Например: `XUI_HOST=http://192.168.1.100:2053`

2. Запустите dev сервер:
   ```bash
   npm run dev
   ```

### Продакшен

⚠️ **Важно**: Прокси Vite работает только в режиме разработки. Для продакшена настройте прокси на уровне веб-сервера:

**Пример для Nginx:**
```nginx
location /api/xui {
    proxy_pass http://your-server-ip:port;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cookie_path / /api/xui;
}
```

**Пример для Apache (.htaccess):**
```apache
ProxyPass /api/xui http://your-server-ip:port
ProxyPassReverse /api/xui http://your-server-ip:port
```

## Безопасность

✅ **Пароли защищены**: 
- Пароли хешируются с помощью `bcryptjs` перед сохранением в Firestore
- В базе данных хранится только хеш пароля (`passwordHash`), а не сам пароль
- При входе пароль сравнивается с хешем с помощью `bcrypt.compare()`
- Поле `passwordHash` не попадает в состояние `currentUser` для дополнительной безопасности

⚠️ **Рекомендации для продакшена**:
- Использование Firebase Authentication вместо локальной проверки (опционально)
- Настройка правил безопасности Firestore
- Использование HTTPS
- Регулярное обновление зависимостей

## Лицензия

Проект разработан для SkyPuth VPN.

