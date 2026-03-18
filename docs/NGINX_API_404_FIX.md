# Исправление 404 для /api/* (перезагрузка модулей, платежи и др.)

## Проблема

При нажатии «Перезагрузить» в разделе «Мониторинг» или при других запросах к API появляется ошибка:
```
Ошибка перезагрузки модуля vpn: Сервер вернул статус 404
```

## Причина

Nginx на `www.skypath.fun` не проксирует запросы `/api/*` на backend (n8n-webhook-proxy на порту 3001).

## Решение

Добавьте блок `location /api/` в конфигурацию nginx **перед** блоком `location /`.

### 1. Откройте конфиг nginx

```bash
sudo nano /etc/nginx/sites-available/skypath.fun
# или
sudo nano /etc/nginx/conf.d/skypath.conf
```

### 2. Добавьте блок (перед `location /`)

```nginx
    # API — проксирование на backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
```

### 3. Проверьте и перезагрузите nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Убедитесь, что backend запущен

```bash
# Backend должен слушать порт 3001
curl -s http://127.0.0.1:3001/api/system/status
```

## Если используется другой порт

Замените `3001` в `proxy_pass` на порт, на котором запущен n8n-webhook-proxy.
