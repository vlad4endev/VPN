# ⚡ Быстрый откат на сервере

## 🚀 Одна команда (если скрипт уже на сервере):

```bash
cd /path/to/project && chmod +x rollback-server.sh && ./rollback-server.sh
```

---

## 📋 Ручной откат (3 команды):

```bash
# 1. Подключитесь к серверу
ssh user@your-server-ip
cd /path/to/project

# 2. Остановите сервисы
docker-compose down  # или: pm2 stop all

# 3. Откатите и перезапустите
git fetch origin && \
git reset --hard 0c96a83f72aa70d64fa8cdcb27e9554beb234b5b && \
git clean -fd && \
docker-compose up -d --build  # или: pm2 restart all
```

---

## 📤 Перенос скрипта на сервер:

```bash
# С локального компьютера:
scp rollback-server.sh user@your-server-ip:/path/to/project/

# Затем на сервере:
ssh user@your-server-ip
cd /path/to/project
chmod +x rollback-server.sh
./rollback-server.sh
```

---

**Подробная инструкция:** см. `ROLLBACK_SERVER.md`
