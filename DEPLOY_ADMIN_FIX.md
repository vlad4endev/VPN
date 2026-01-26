# Обновление деплоя после исправления AdminProvider

Ошибка `Cannot read properties of null (reading 'useState')` в админке возникает, когда браузер грузит **старую** сборку, в которой `AdminProviderWrapper` ещё вызывал хуки.

## Что уже исправлено в коде

- `AdminProvider.jsx` больше **не использует** `useState` и `useAdmin` — только формирует value и рендерит провайдер.
- Админка рендерится через `AdminViewWithContext` в `App.jsx`, который вызывает `useAdmin` и передаёт результат в `AdminProviderWrapper` как `injectHandlers`.

## Что сделать, чтобы ошибка пропала на www.skypath.fun

1. **Пересобрать проект с очисткой кэша Vite**
   ```bash
   rm -rf node_modules/.vite dist
   npm run build
   ```

2. **Залить новую сборку на сервер**  
   Убедитесь, что на хостинг попала свежая папка `dist/` (или новый образ/артефакт), а не старый кэш.

3. **Сбросить кэш в браузере при проверке**
   - Жёсткое обновление: `Ctrl+Shift+R` (Windows/Linux) или `Cmd+Shift+R` (macOS).
   - Либо DevTools → Application → Clear storage → Clear site data.

4. **Проверить, что грузится новый бандл**
   - В DevTools → Network включите "Disable cache", перезагрузите страницу и откройте админку.
   - Ошибка должна исчезнуть, если запросы идут к новым файлам из последнего `npm run build`.

## Точка входа приложения

Используется `index.html` → `/src/app/main.jsx` → `App.jsx`. Компонент `VPNServiceApp` в `App.jsx` при `view === 'admin'` рендерит `<AdminViewWithContext>`, а не `<AdminProviderWrapper>` напрямую. Файл `src/VPNServiceApp.jsx` в этой схеме не используется; если у вас отдельно собирается или отдаётся код из `VPNServiceApp.jsx`, его тоже нужно перевести на использование `AdminViewWithContext` и передачу `injectHandlers` в `AdminProviderWrapper`.
