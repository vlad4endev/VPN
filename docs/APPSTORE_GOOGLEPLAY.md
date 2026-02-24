# Подготовка SKYFLOW к публикации в App Store и Google Play

Проект подготовлен к сборке нативных приложений через **Capacitor**: веб-приложение упаковывается в нативную оболочку и может быть опубликовано в магазинах.

---

## 1. Что уже сделано в репозитории

- **PWA manifest** (`public/manifest.webmanifest`) — имя, иконки, theme-color, `display: standalone`.
- **Ссылка на manifest** в `index.html`.
- **Capacitor** — конфиг `capacitor.config.json`, скрипты в `package.json`.
- **Мета-теги** для мобильных: `theme-color`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, safe area в CSS.

---

## 2. Иконки и графика

### PWA (сайт и «Добавить на экран»)

Для манифеста нужны PNG-иконки (часть браузеров не поддерживает SVG в manifest):

- `public/icons/icon-192.png` — 192×192 px  
- `public/icons/icon-512.png` — 512×512 px (желательно maskable: важное по центру в круге 80%)

Создать из `public/favicon.svg` можно, например, через [realfavicongenerator.net](https://realfavicongenerator.net/) или ImageMagick:

```bash
# Пример (если установлен ImageMagick и rsvg-convert):
mkdir -p public/icons
rsvg-convert -w 192 -h 192 public/favicon.svg -o public/icons/icon-192.png
rsvg-convert -w 512 -h 512 public/favicon.svg -o public/icons/icon-512.png
```

### Capacitor (iOS / Android)

После добавления платформ (`cap:add:ios`, `cap:add:android`) иконки и splash задаются в нативных проектах:

- **iOS**: в Xcode — `ios/App/App/Assets.xcassets/AppIcon.appiconset` и `Splash.imageset`.
- **Android**: в Android Studio — `android/app/src/main/res/mipmap-*` и drawable для splash.

Рекомендуется подготовить:

- **Иконка приложения**: 1024×1024 px (PNG без прозрачности для iOS).
- **Splash**: 2732×2732 px или по гайдам Apple/Google (фон `#020617` уже задан в `capacitor.config.json`).

---

## 3. Сборка и запуск нативных проектов

### Установка зависимостей

```bash
npm install
```

### Первый запуск (добавление платформ)

1. Соберите веб-приложение:

   ```bash
   npm run build
   ```

2. Добавьте платформы (выполняется один раз):

   ```bash
   npm run cap:add:ios
   npm run cap:add:android
   ```

3. Дальше после каждого изменения веба — синхронизация и открытие студии:

   ```bash
   npm run cap:sync
   npm run cap:ios      # открывает Xcode
   npm run cap:android  # открывает Android Studio
   ```

### Требования к окружению

- **iOS**: macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`), Apple Developer Account.
- **Android**: Android Studio (Hedgehog или новее), JDK 17, SDK 24+.

---

## 4. App Store (Apple)

### Обязательно

| Шаг | Действие |
|-----|----------|
| 1 | [Apple Developer Program](https://developer.apple.com/programs/) — оплата и аккаунт. |
| 2 | В Xcode: выберите команду/команды разработки, укажите Bundle ID (например `fun.skypath.skyflow`). |
| 3 | App Store Connect: создайте приложение, укажите название **SKYFLOW**, категорию (например Utilities). |
| 4 | Скриншоты: iPhone 6.7", 6.5", 5.5"; iPad 12.9" при наличии поддержки. |
| 5 | Описание, ключевые слова, ссылка на **Политику конфиденциальности** (обязательна). |
| 6 | Возрастной рейтинг (обычно 4+). |
| 7 | Подпись: автоматическая (Signing & Capabilities) или свой сертификат. |
| 8 | Архив: Product → Archive → Distribute App → App Store Connect. |

### Рекомендации

- **Privacy Policy URL** — должен быть доступен по HTTPS (например `https://skypath.fun/privacy`).
- **Support URL** — страница поддержки или Telegram.
- **SKAdNetwork** / реклама — только если в приложении есть реклама.

---

## 5. Google Play

### Обязательно

| Шаг | Действие |
|-----|----------|
| 1 | [Google Play Console](https://play.google.com/console) — аккаунт разработчика (разовый взнос). |
| 2 | Создать приложение, указать название **SKYFLOW**, тип (приложение). |
| 3 | Подписание: сгенерировать upload key (или использовать существующий), настроить signing в Android Studio. |
| 4 | Контент: политика конфиденциальности (URL), вопрос о рекламе (есть/нет). |
| 5 | Анкета по контенту и целевой аудитории, рейтинг (например PEGI 3, ESRB). |
| 6 | Store listing: краткое и полное описание, скриншоты (телефон 16:9 или 9:16, планшет при необходимости), иконка 512×512. |
| 7 | Сборка: Build → App Bundle (.aab), загрузить в консоль в раздел Release. |

### Формат сборки

- Рекомендуется загружать **Android App Bundle (.aab)**, не APK.
- В Android Studio: Build → Generate Signed Bundle / APK → Android App Bundle.

---

## 6. Общие моменты

- **Домен и API**: в приложении должен использоваться продакшен-домен (например `https://skypath.fun`). В `capacitor.config.json` в `server.allowNavigation` уже добавлены нужные домены.
- **Firebase**: те же конфиги (например `google-services.json` для Android и `GoogleService-Info.plist` для iOS), что и для веба, если используете один проект Firebase.
- **Версионирование**: для магазинов увеличивайте `version` в `package.json` и соответствующие версии в Xcode (CFBundleShortVersionString) и в `android/app/build.gradle` (versionName / versionCode).

---

## 7. Краткий чеклист перед отправкой

**Оба магазина**

- [ ] Иконки 192/512 в `public/icons/` (для PWA) и нативные иконки в проектах iOS/Android.
- [ ] Политика конфиденциальности опубликована и ссылка указана в листинге.
- [ ] Скриншоты для требуемых размеров устройств.
- [ ] Корректное имя приложения и описание.

**Только App Store**

- [ ] Apple Developer Account, Bundle ID, профили подписей.
- [ ] Архив и загрузка через Xcode в App Store Connect.

**Только Google Play**

- [ ] Подписанный AAB, ключ хранится в безопасности.
- [ ] Заполнены анкеты по контенту и рейтингу.

После выполнения этих шагов проект готов к выкладке в App Store и Google Play.
