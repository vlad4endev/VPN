# 🔄 Инструкция по откату проекта на сервере

> Откат проекта к коммиту `0c96a83f72aa70d64fa8cdcb27e9554beb234b5b`

---

## 🚀 Быстрый способ (рекомендуется)

### Вариант 1: Использование скрипта

1. **Подключитесь к серверу:**
```bash
ssh user@your-server-ip
```

2. **Перейдите в директорию проекта:**
```bash
cd /path/to/your/project
# Например: cd ~/skypath-flow
```

3. **Скачайте скрипт отката (если его еще нет на сервере):**
```bash
# Если скрипт уже есть в проекте:
chmod +x rollback-server.sh
./rollback-server.sh

# Или укажите путь к проекту:
./rollback-server.sh /path/to/project
```

4. **Следуйте инструкциям скрипта**

---

## 📋 Ручной способ

### Шаг 1: Подключение к серверу

```bash
ssh user@your-server-ip
```

### Шаг 2: Переход в директорию проекта

```bash
cd /path/to/your/project
# Например:
# cd ~/skypath-flow
# или
# cd /opt/skypath-flow
```

### Шаг 3: Остановка сервисов

#### Если используется Docker:

```bash
docker-compose down
```

#### Если используется PM2:

```bash
pm2 stop all
```

#### Если используется systemd:

```bash
sudo systemctl stop skypath-flow-backend
sudo systemctl stop skypath-flow-frontend
# или (legacy): skyputh-vpn-backend, skyputh-vpn-frontend
```

#### Если используется npm напрямую:

Нажмите `Ctrl+C` в терминале, где запущен сервер.

---

### Шаг 4: Откат к нужному коммиту

```bash
# Получаем последние изменения
git fetch origin

# Откатываемся к коммиту
git reset --hard 0c96a83f72aa70d64fa8cdcb27e9554beb234b5b

# Удаляем неотслеживаемые файлы
git clean -fd

# Проверяем статус
git status
```

---

### Шаг 5: Перезапуск сервисов

#### Если используется Docker:

```bash
docker-compose up -d --build
```

#### Если используется PM2:

```bash
# Если есть ecosystem.config.js:
pm2 restart ecosystem.config.js

# Или перезапуск всех процессов:
pm2 restart all

# Или запуск с нуля:
pm2 delete all
cd server && pm2 start proxy-server.js --name skypath-flow-backend
cd .. && pm2 serve dist 5173 --name skypath-flow-frontend --spa
```

#### Если используется systemd:

```bash
sudo systemctl start skypath-flow-backend
sudo systemctl start skypath-flow-frontend

# Проверка статуса:
sudo systemctl status skypath-flow-backend
sudo systemctl status skypath-flow-frontend
```

#### Если используется npm напрямую:

```bash
# Backend (в одном терминале):
cd server
npm start

# Frontend (в другом терминале):
npm run dev
```

---

## ✅ Проверка отката

### 1. Проверьте текущий коммит:

```bash
git log --oneline -1
# Должно показать: 0c96a83 Исправления: formatTimeRemaining, уведомления и кеш домена
```

### 2. Проверьте статус сервисов:

#### Docker:
```bash
docker-compose ps
docker-compose logs -f
```

#### PM2:
```bash
pm2 status
pm2 logs
```

#### systemd:
```bash
sudo systemctl status skypath-flow-backend
sudo systemctl status skypath-flow-frontend
```

### 3. Проверьте работоспособность:

```bash
# Healthcheck (если настроен)
curl http://localhost:3001/health

# Или откройте в браузере:
# http://your-server-ip:3001
```

---

## 🔍 Определение типа развертывания

Если не знаете, какой способ развертывания используется:

```bash
# Проверка Docker:
ls docker-compose.yml docker-compose.yaml 2>/dev/null && echo "Используется Docker"

# Проверка PM2:
pm2 list 2>/dev/null && echo "Используется PM2"

# Проверка systemd:
systemctl list-units --type=service | grep -E 'skypath-flow|skyputh-vpn' && echo "Используется systemd"

# Проверка запущенных процессов:
ps aux | grep -E "node|vite" | grep -v grep
```

---

## ⚠️ Важные замечания

1. **Резервное копирование:** Перед откатом рекомендуется создать резервную копию:
```bash
# Создать бэкап директории проекта
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz /path/to/project
```

2. **Переменные окружения:** Убедитесь, что файлы `.env` не будут удалены:
```bash
# Проверьте, что .env в .gitignore
git check-ignore .env
```

3. **База данных:** Если есть миграции БД, возможно потребуется их откат отдельно.

4. **Логи:** Сохраните логи перед откатом, если они важны:
```bash
# Для Docker:
docker-compose logs > logs-backup-$(date +%Y%m%d).log

# Для PM2:
pm2 logs > logs-backup-$(date +%Y%m%d).log
```

---

## 🆘 Если что-то пошло не так

### Восстановление из резервной копии:

```bash
# Остановите сервисы
docker-compose down  # или pm2 stop all

# Восстановите из бэкапа
tar -xzf backup-YYYYMMDD-HHMMSS.tar.gz -C /

# Перезапустите сервисы
docker-compose up -d  # или pm2 restart all
```

### Откат к предыдущему коммиту:

```bash
git reset --hard HEAD~1  # Откат на 1 коммит назад
# или
git reset --hard <commit-hash>  # Откат к конкретному коммиту
```

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи сервисов
2. Убедитесь, что все зависимости установлены: `npm install`
3. Проверьте переменные окружения: `node check-env.js`
4. Проверьте права доступа к файлам

---

**Дата создания:** 2026-01-17  
**Коммит для отката:** `0c96a83f72aa70d64fa8cdcb27e9554beb234b5b`
