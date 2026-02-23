# Чеклист локализации (i18n)

## Языки и переключение

- **Поддерживаемые языки:** ru, en, hi, ar, tg, uz, kk, ky (8 языков).
- **Переключатель:** сайдбар / шапка — компонент `LanguageSwitcher.jsx`, ключи `lang.ru`, `lang.en`, `lang.hi` и т.д.
- **Сохранение:** выбор сохраняется в `localStorage` (ключ `vpn-ui-lang`), при следующем визите язык подхватывается автоматически.
- **RTL:** для арабского (`ar`) автоматически выставляется `dir="rtl"` на `document.documentElement`.

---

## 1. Главный экран (Welcome)

| Элемент | Ключ i18n | Примечание |
|--------|-----------|------------|
| Бейдж цены | `welcome.badge` | |
| Слоган | `welcome.tagline` | |
| Подзаголовок | `welcome.subtitle` | |
| CTA текст | `welcome.cta` | |
| Кнопка «Войти через Telegram» | `welcome.signInTelegram` | |
| «Войти или зарегистрироваться через Telegram» | `welcome.signInOrRegisterTelegram` | |
| «Начать работу» | `welcome.getStarted` | |
| «Войти в кабинет» | `welcome.enterCabinet` | |
| Блок «Преимущества» | `welcome.benefits`, `benefitCabinetTitle`, `benefitCabinetDesc`, `benefitSupportTitle`, `benefitSupportDesc`, `benefitLocationsTitle`, `benefitLocationsDesc` | |
| Тарифы на главной | `welcome.tariffs`, `tariffChoice`, `devices_one/few/many`, `devicesSuper`, `devicesMulti`, `encryption`, `locationsList`, `duration1/3/6/12`, `perMonth`, `discountBadge`, `discountNote` | |
| Статистика и отзывы | `statsUsers`, `statsReviews`, `statsRating`, `reviewsSection`, `reviewsSubtitle`, `reviewPrev`, `reviewNext`, `ratingLabel`, `reviewsEmpty` | |
| «Главный экран» | `welcome.mainScreen` | |

---

## 2. Сайдбар (личный кабинет и админка)

| Элемент | Ключ i18n | Примечание |
|--------|-----------|------------|
| Заголовок блока «Личный кабинет» | `sidebar.cabinet` | |
| «Админ-панель» | `sidebar.admin` | |
| «Финансы» | `sidebar.finances` | |
| «Аналитика» | `sidebar.analytics` | |
| «Поддержка» | `sidebar.support` | |
| «Выйти» | `sidebar.logout` | |
| «Поддержка в Telegram» (aria) | `sidebar.supportLink` | |
| Подразделы кабинета | `sidebar.subscription`, `sidebar.profile`, `sidebar.payments` | |
| «Прочее» (админка, мобильная панель) | `sidebar.more` | |
| «Разделы» | `sidebar.sections` | |
| Aria для вкладок кабинета | `sidebar.sectionsCabinetAria` | |
| Aria для вкладок админки | `sidebar.sectionsAdminAria` | |
| Aria «Остальные разделы» | `sidebar.moreSectionsAria` | |
| Пункты меню админки | `admin.sectionHome`, `admin.sectionUsersSupport`, …; `admin.dashboard`, `admin.users`, `admin.tickets`, … | См. `navSections.js` (titleKey / labelKey) |

---

## 3. Личный кабинет (Dashboard)

### 3.1 Вкладка «Подписка»

| Элемент | Ключ i18n | Примечание |
|--------|-----------|------------|
| Подзаголовок экрана | `dashboard.subtitle` | |
| Карточки: Статус, Тариф, Ключ | `dashboard.status`, `dashboard.tariff`, `dashboard.key` | |
| Значения: «Не выбран», «Активен», «Не получен» | `dashboard.notSelected`, `dashboard.active`, `dashboard.notReceived` | |
| Текущая подписка, период, трафик, оплата | `dashboard.currentSubscription`, `dashboard.notSpecified`, `dashboard.devices`, `dashboard.period`, `dashboard.traffic`, `dashboard.month/months`, `dashboard.validityPeriod`, `dashboard.payment` | |
| Статусы подписки | `dashboard.expired`, `dashboard.paid`, `dashboard.test`, `dashboard.unpaid`, `dashboard.dash` | |
| Истекает через / менее дня | `dashboard.expiringIn`, `dashboard.lessThanDay` | |
| Склонение дней | `dashboard.day_one`, `dashboard.day_few`, `dashboard.day_many` | |
| Подсказка продления | `dashboard.renewHint`, `dashboard.renewAria`, `dashboard.processing`, `dashboard.renew` | |
| Окно оплаты / 5 дней | `dashboard.paymentWindowOpen`, `dashboard.payWithin5Days`, `dashboard.subscriptionWillBeRemoved`, `dashboard.paymentRequired` | |
| Конфигурация, «Получить ключ» | `dashboard.config`, `dashboard.getKey` | |
| «Выберите тариф», ХИТ | `dashboard.chooseTariff`, `dashboard.hit` | |
| Карточки тарифов (устройства, поддержка, подключение) | `dashboard.deviceOne`, `dashboard.devicesMany`, `dashboard.supportPriority`, `dashboard.connectionFast`, `dashboard.trafficSpeed`, `dashboard.supportStandard` | |
| Кнопка выбора тарифа | `dashboard.selectTariffAria`, `dashboard.selectTariffBtn` | |
| Цена за месяц (кратко) | `dashboard.perMonthShort` | |
| Реферальный блок | `dashboard.inviteFriend`, `dashboard.referralDescription`, `dashboard.linkLabel`, `dashboard.referralLinkAria`, `dashboard.copyLinkAria`, `dashboard.copyCodeAria` | |
| Реферальный баланс (Trans) | `dashboard.referralBalance` | |
| Прочие тексты подписки | `dashboard.profileSettings`, `dashboard.notGenerated`, `dashboard.name`, `dashboard.namePlaceholder`, `dashboard.notSet`, `dashboard.phone`, `dashboard.dangerZone`, `dashboard.paymentHistory`, `dashboard.noPayments`, `dashboard.date`, `dashboard.amount`, `dashboard.deleteWarning`, `dashboard.deleting`, `dashboard.confirmUnsubscribe`, `dashboard.afterExpiryNote`, `dashboard.paymentRequiredDays`, `dashboard.paymentRequiredForActivation`, `dashboard.confirmUnsubscribeTitle`, `dashboard.confirmUnsubscribeQuestion`, `dashboard.tariffTableHeader`, `dashboard.statusTableHeader`, `dashboard.cancelSubscription`, `dashboard.cancelEditAria`, `dashboard.editProfileAria`, `dashboard.editProfile`, `dashboard.saveProfileAria`, `dashboard.confirmDeleteAria` | |
| Сообщения при проверке платежа | `dashboard.statusAccountant`, `dashboard.statusPending`, `dashboard.statusChecking` | |
| Fallback названия подписки | `dashboard.subscriptionFallback` | |

### 3.2 Статусы (общие для кабинета и ключа)

Все подписи статусов через `status.*` в `userStatus.js` и в карточках:

| Ключ | Пример (RU) |
|------|--------------|
| `status.noKey` | Нет ключа |
| `status.active` | Активен |
| `status.expired` | Истек |
| `status.noSubscription` | Нет подписки |
| `status.expiringInDays` | Истекает через {{count}} {{dayWord}} |
| `status.graceDays` | Просрочено {{count}} {{dayWord}} |
| `status.overdue` | Просрочено |
| `status.pendingPayment` | Ожидает оплаты |
| `status.testRemaining` | Тест (осталось {{hours}}ч {{minutes}}м) |
| `status.activating` | Активация... |
| `status.cancelled` | Отменена |
| `status.activationError` | Ошибка активации |
| `status.unknown` | Неизвестный статус |
| `status.unpaid` | Не оплачено |
| `status.inactive` | Неактивна |

### 3.3 Модальное окно «Ключ» (KeyModal)

| Элемент | Ключ i18n |
|--------|-----------|
| Загрузка ссылки | `keyModal.loadingLink` |
| Ссылка недоступна | `keyModal.linkUnavailable` |
| Заголовок (Нидерланды) | `app.netherlands` |
| Закрыть | `common.close` |
| Статус | `app.status` |
| Ваша ссылка на подписку | `app.subscriptionLinkLabel` |
| Копировать ссылку (aria) | `dashboard.copyLinkAria` |
| Текст кнопки «Копировать ссылку» | `app.copyLink` |
| Скачать приложение на устройство | `keyModal.downloadApp` |
| Скачать для {{platform}} | `keyModal.downloadFor` |
| Добавить подписку в приложение | `keyModal.addSubscription` |
| План / Премиум / Бесплатный | `app.plan`, `app.premium`, `app.free` |
| Истекает / Не ограничен / (из 3x-ui) | `app.expires`, `app.unlimited`, `app.from3xui` |

### 3.4 Модальное окно выбора тарифа (TariffSelectionModal)

Все строки через `tariff.*` и `common.*`: заголовок, период, устройства, промокод, цены, скидка, итого, серверы, подтверждение, способы оплаты, кнопки «Оплатить сейчас», «Оплатить позже», «Подтвердить», «Отмена», «Назад», сообщения об ошибках и в `alert()` — через `i18n.t('tariff.*')`.

### 3.5 Модальные «Успех подписки» и «Обработка платежа»

- `subscriptionSuccess.*` — заголовки, кнопки, подсказки, «Проверить статус оплаты», «Скопировано» и т.д.
- `paymentProcessing.*` — «Бухгалтер создает платежку», «Завершите оплату в открывшемся окне», «Платеж не прошел» и т.д.

---

## 4. Авторизация и приложение

- **Форма входа/регистрации:** `auth.login`, `auth.register`, `auth.loginOrEmail`, `auth.consentError` и остальные `auth.*`.
- **Сообщения об ошибках/успехе:** `app.authUnavailable`, `app.enterLoginOrEmail`, `app.userDataNotFound`, `app.loginSuccess`, `app.loginError`, `app.telegramSignInFailed`, `app.telegramSignInError` и т.д.
- **Валидация имени:** `validation.nameRequired`, `validation.nameMinLength`, `validation.nameMaxLength`, `validation.nameInvalidChars`.
- **Модалка «Вход через Telegram» (App.jsx):** `app.telegramTitle`, `app.telegramBodyWithLink`, `app.telegramBodyNoLink`, `app.openInTelegram`, `common.close`.
- **Кабинет в App (старый сайдбар):** `app.manage`, `app.cabinet`, `app.logout`.

---

## 5. Админ-панель

- Заголовок и хлебные крошки: `sidebar.admin`, `admin.manageSystem`, `admin.toDashboard`, `admin.dashboard`; секции и пункты — `admin.sectionHome`, `admin.dashboard`, `admin.users` и т.д. (см. `navSections.js`).
- AI-воронка: статус подписки в таблице — `status.noSubscription`, `status.active`, `admin.expiredDaysAgo` (через `subscriptionStatus(row, t)` в `AnalyticsFunnelPanel.jsx`).

---

## 6. Поддержка, профиль, прочее

- Поддержка: `support.*` (тикеты, архив, «Написать сообщение», «Отправить» и т.д.).
- Привязка Telegram: `telegramBind.*`.
- Установка пароля: `setPassword.*`.
- Футер: `footer.*`.
- Конфиг-ошибка: `config.*`.
- Логгер: `logger.*`.

---

## 7. Полнота локалей

- Во всех 8 файлах `src/i18n/locales/*.json` должен быть один и тот же набор ключей (эталон — `ru.json`).
- Проверка: `node -e "..."` с обходом ключей из `ru.json` и сравнением с остальными локалями (см. выполненную проверку — 0 missing по всем языкам после добавления `tariff.confirmChoiceSuper/Multi` и `welcome.devices_one/few/many` для kk, ky, tg, uz).

---

## 8. Что переводится при переключении языка

- Весь видимый текст в сайдбаре (названия разделов, подразделы кабинета и админки).
- Весь контент личного кабинета: подзаголовок, карточки статуса/тарифа/ключа, кнопки, тарифы, реферальный блок.
- Модальные окна: ключ, выбор тарифа, успех подписки, обработка платежа — все подписи и сообщения.
- Формы входа/регистрации и все сообщения об ошибках/успехе.
- Админка: заголовки, хлебные крошки, таблица AI-воронки (статусы подписки).

При смене языка в переключателе интерфейс обновляется без перезагрузки страницы (react-i18next).
