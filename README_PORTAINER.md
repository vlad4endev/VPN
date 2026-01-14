# 🐳 Установка через Portainer

> Простой способ развертывания SkyPuth VPN через Portainer Stack

---

## ⚡ Быстрый старт

### Способ 1: Из Git Repository

1. Откройте **Portainer** → **Stacks** → **Add stack**
2. **Name**: `skyputh-vpn`
3. **Build method**: **Repository**
4. **Repository URL**: `https://github.com/vlad4endev/VPN.git`
5. **Reference**: `main` (⚠️ убедитесь, что ветка запушена: `git push -u origin main`)
6. **Compose path**: `portainer-stack.yml`
7. Добавьте переменные окружения (см. ниже)
8. Нажмите **Deploy the stack**

### Способ 2: Web Editor (если Repository не работает)

⚠️ **Если получаете ошибку "не удалось найти ссылку «main»"**, используйте этот способ:

1. Откройте **Portainer** → **Stacks** → **Add stack**
2. **Name**: `skyputh-vpn`
3. **Build method**: **Web editor**
4. Скопируйте содержимое `portainer-stack-web-editor.yml`
5. Вставьте в редактор Portainer
6. Измените `build.context` на путь к коду на сервере (например, `/opt/skyputh-vpn`)
7. Или используйте готовый образ: замените `build:` на `image: skyputh-vpn:latest`
8. Добавьте переменные окружения
9. Нажмите **Deploy the stack**

📚 **Подробное решение проблем**: 
- Не находит ветку `main`: см. `PORTAINER_FIX.md`
- Не находит Dockerfile: см. `PORTAINER_DOCKERFILE_FIX.md`
- Быстрое решение: см. `PORTAINER_QUICK_FIX.md`

---

## 📝 Переменные окружения

Добавьте в **Environment variables** в Portainer:

### Backend (БЕЗ префикса VITE_):

```
XUI_HOST=http://your-3xui-server:2053
XUI_USERNAME=admin
XUI_PASSWORD=your_password
XUI_INBOUND_ID=1
```

### Frontend (С префиксом VITE_):

```
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### CORS:

```
ALLOWED_ORIGINS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

---

## ✅ Проверка

1. **Stacks** → `skyputh-vpn` → **Containers**
2. Контейнер должен быть **Running** (зеленый)
3. Health должен быть **Healthy** (зеленый)

---

## 📚 Подробная инструкция

См. `PORTAINER_INSTALL.md` для полного руководства.

---

**Готово!** Приложение установлено через Portainer. 🎉
