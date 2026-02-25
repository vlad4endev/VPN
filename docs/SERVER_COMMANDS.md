# Команды на сервере (ты уже в SSH)

Выполняй по порядку в терминале, где подключился к серверу.

---

## 1. Установка Docker (если ещё нет)

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Выйди из SSH и зайди снова, чтобы группа docker применилась
```

---

## 2. Клонирование проекта

```bash
cd ~
git clone https://github.com/vlad4endev/VPN.git skyputh-vpn
cd skyputh-vpn
```

*(Если репозиторий приватный — используй свой URL с токеном или SSH.)*

---

## 3. Создание .env.production

```bash
cp server/.env.example .env.production
nano .env.production
```

**Минимум что нужно поменять:**

| Переменная | Что подставить |
|------------|----------------|
| `XUI_HOST` | URL панели 3x-ui, например `http://127.0.0.1:2053` |
| `XUI_USERNAME` | Логин 3x-ui |
| `XUI_PASSWORD` | Пароль 3x-ui |
| `XUI_INBOUND_ID` | ID инбаунда (часто `1`) |
| `NODE_ENV` | Должно быть `production` |
| `ALLOWED_ORIGINS` | Твой фронт: `https://твой-домен.com` или `http://IP:3001` |
| `FRONTEND_URL` | То же значение |
| `FIREBASE_PROJECT_ID` | ID проекта Firebase |
| Firebase ключ | Раскомментировать один из вариантов (например `FIREBASE_SERVICE_ACCOUNT_PATH=...`) |

Сохранить: `Ctrl+O`, Enter, выход: `Ctrl+X`.

```bash
chmod 600 .env.production
```

---

## 4. Запуск через Docker

```bash
docker compose up -d --build
```

*(Если команда не найдена, попробуй: `docker-compose up -d --build`.)*

---

## 5. Проверка

```bash
docker compose ps
curl http://localhost:3001/health
```

В браузере: `http://IP_СЕРВЕРА:3001` (или твой домен).

---

## 6. Логи (если что-то не работает)

```bash
docker compose logs -f
```

Остановка: `Ctrl+C` (логи перестанут идти, контейнер продолжит работать).

---

## Обновление позже

```bash
cd ~/skyputh-vpn
git pull origin main
docker compose up -d --build
```

---

**Если хочешь, могу по шагам подсказать, что именно вписать в `nano .env.production` (пришли значения без паролей: домен, есть ли 3x-ui на этом же сервере, и т.д.).**
