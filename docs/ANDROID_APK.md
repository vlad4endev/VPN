# Сборка APK для Android

Capacitor настроен для SKYFLOW: тёмная тема (#020617), разрешения, deep links, allowNavigation для Firebase/Yandex/Telegram.

## Требования

1. **Java JDK 17** (или 11)
   - macOS: `brew install openjdk@17`
   - Или скачайте с [Adoptium](https://adoptium.net/)
   - Или используйте JDK из Android Studio

2. **Android SDK** (если Gradle не находит)
   - Установите [Android Studio](https://developer.android.com/studio)
   - Или только [Command Line Tools](https://developer.android.com/studio#command-tools)
   - Переменные: `ANDROID_HOME` или `ANDROID_SDK_ROOT`

## Команды

### Debug APK (для тестов)

```bash
npm run build:apk
```

APK будет в: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (для публикации)

```bash
npm run build:apk:release
```

Для release нужна подпись. Настройте `android/app/build.gradle`:
- Создайте keystore: `keytool -genkey -v -keystore skyflow.keystore -alias skyflow -keyalg RSA -keysize 2048 -validity 10000`
- Добавьте `signingConfigs` в `build.gradle`

## Альтернатива: Android Studio

1. `npm run cap:sync` — собрать и синхронизировать
2. `npm run cap:android` — открыть проект в Android Studio
3. В Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

## Структура

- `android/` — нативный Android-проект (Capacitor)
- `dist/` — веб-приложение (копируется в android при sync)
- `capacitor.config.json` — конфигурация Capacitor
