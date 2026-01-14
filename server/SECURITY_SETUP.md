# Настройка безопасности для Proxy серверов

## Быстрый старт

### 1. Установка зависимостей

```bash
cd server
npm install
```

Это установит все необходимые зависимости, включая `helmet` для безопасности.

### 2. Настройка переменных окружения

Создайте файл `.env` в директории `server/` со следующим содержимым:

```bash
# Environment
NODE_ENV=production

# Server
PROXY_PORT=3001
PROXY_HOST=0.0.0.0

# Domain
DOMAIN=yourdomain.com

# Frontend URLs (для CORS)
FRONTEND_URL=https://yourdomain.com
VITE_FRONTEND_URL=https://yourdomain.com

# CORS - список разрешенных доменов через запятую
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 3x-ui Configuration
XUI_HOST=http://localhost:2053
```

### 3. Запуск сервера

#### Development режим:
```bash
npm run dev
```

#### Production режим:
```bash
npm start
```

#### Через PM2:
```bash
npm run pm2:start
```

## Что было добавлено

### ✅ Безопасность

1. **Helmet** - автоматические заголовки безопасности:
   - HSTS (HTTP Strict Transport Security)
   - Content Security Policy (CSP)
   - X-Frame-Options
   - X-Content-Type-Options
   - И другие защитные заголовки

2. **Принудительное HTTPS** - в production все HTTP запросы перенаправляются на HTTPS

3. **Безопасный CORS**:
   - Whitelist разрешенных доменов в production
   - Автоматическое разрешение localhost в development
   - Валидация origin перед установкой заголовков

4. **Content Security Policy**:
   - Защита от XSS атак
   - Ограничение источников загружаемых ресурсов
   - Блокировка iframe и object элементов

## Настройка Nginx

Для полной безопасности рекомендуется использовать Nginx как reverse proxy.

### 1. Установите SSL сертификат (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 2. Используйте пример конфигурации

Скопируйте `nginx.conf.example` в `/etc/nginx/sites-available/your-app`:

```bash
sudo cp server/nginx.conf.example /etc/nginx/sites-available/your-app
sudo nano /etc/nginx/sites-available/your-app
```

Замените `yourdomain.com` на ваш домен.

### 3. Активируйте конфигурацию

```bash
sudo ln -s /etc/nginx/sites-available/your-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Проверка безопасности

### 1. SSL Labs Test
Проверьте SSL конфигурацию:
https://www.ssllabs.com/ssltest/

### 2. Security Headers
Проверьте заголовки безопасности:
https://securityheaders.com/

### 3. CSP Evaluator
Проверьте CSP политику:
https://csp-evaluator.withgoogle.com/

## Важные замечания

### Development vs Production

- **Development**: CORS разрешает localhost, CSP более мягкая, HTTPS не обязателен
- **Production**: Строгий CORS whitelist, строгая CSP, принудительное HTTPS

### Переменные окружения

- `ALLOWED_ORIGINS` - обязательно в production для безопасности
- `FRONTEND_URL` или `VITE_FRONTEND_URL` - URL фронтенд приложения
- `NODE_ENV=production` - включает все защитные механизмы

### Логирование

Сервер логирует все заблокированные CORS запросы:
```
🚫 CORS blocked origin: https://malicious-site.com
🚫 Blocked request from unauthorized origin: https://malicious-site.com
```

## Troubleshooting

### CORS ошибки в браузере

1. Проверьте, что домен добавлен в `ALLOWED_ORIGINS`
2. Убедитесь, что `FRONTEND_URL` указан правильно
3. В development режиме localhost разрешен автоматически

### CSP блокирует ресурсы

1. Проверьте консоль браузера на ошибки CSP
2. Добавьте необходимые источники в CSP директивы в коде
3. Используйте `reportOnly: true` в development для тестирования

### HTTPS редирект не работает

1. Убедитесь, что `NODE_ENV=production`
2. Проверьте заголовок `X-Forwarded-Proto` от nginx
3. В nginx убедитесь, что установлен `proxy_set_header X-Forwarded-Proto $scheme;`

## Дополнительная информация

См. полное руководство: `SECURITY_CONFIGURATION.md` в корне проекта.

