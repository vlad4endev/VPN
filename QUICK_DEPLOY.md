# ⚡ Быстрый деплой на удаленный сервер

> Краткая инструкция для запуска проекта одной командой

---

## 🚀 Быстрый старт (5 минут)

### 1. Подключитесь к серверу

```bash
ssh user@your-server-ip
```

### 2. Установите Docker (если не установлен)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### 3. Клонируйте репозиторий

```bash
git clone https://github.com/vlad4endev/VPN.git skyputh-vpn
cd skyputh-vpn
```

### 4. Настройте переменные окружения

```bash
cp .env.example .env.production
nano .env.production
# Заполните все переменные (см. .env.example)
```

### 5. Запустите одной командой

```bash
docker-compose up -d --build
```

### 6. Проверьте работоспособность

```bash
# Проверка статуса
docker-compose ps

# Проверка healthcheck
curl http://localhost:3001/health

# Просмотр логов
docker-compose logs -f
```

---

## ✅ Готово!

Приложение доступно по адресу:
- **http://your-server-ip:3001**
- **https://yourdomain.com** (если настроен Nginx)

---

## 🔄 Обновление приложения

```bash
cd ~/skyputh-vpn
git pull origin main
docker-compose up -d --build
```

---

## 📚 Подробная инструкция

См. `DEPLOY_INSTRUCTIONS.md` для полного руководства.
