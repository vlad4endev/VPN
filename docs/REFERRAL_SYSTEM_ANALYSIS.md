# Анализ реферальной системы — выявленные проблемы

## Краткое резюме

Обнаружены **критические ошибки**, из‑за которых:
1. **Бонусы не начисляются** — `resolveReferralCode` вызывается до аутентификации и падает с `permission-denied` в Firestore
2. **Ссылка недоступна у части пользователей** — возможны race conditions и несовпадение API URL
3. **Логика запутанная** — несколько точек отказа, нет единого API для резолва кода

---

## Проблема 1: Бонусы не начисляются (критическая)

### Причина

`resolveReferralCode()` вызывается **до** создания пользователя в Firebase Auth:

```javascript
// App.jsx, handleRegister — строки 1157–1162
const refCode = referralCodePending || getReferralCodePending(false)
let inviterId = null
if (refCode && refCode.trim()) {
  inviterId = await resolveReferralCode(db, refCode.trim())  // ← Пользователь ещё НЕ аутентифицирован!
}
// ...
const userCredential = await createUserWithEmailAndPassword(auth, email, password)
```

`resolveReferralCode` выполняет запрос к Firestore:

```javascript
// referralService.js
const q = query(usersRef, where('referralCode', '==', trimmed))
const snap = await getDocs(q)
```

Правила Firestore для `users_v4`:

```
allow read: if request.auth != null && (isOwner(userId) || isAdmin() || ...)
```

При регистрации `request.auth` ещё `null` → запрос падает с `permission-denied` → `inviterId` остаётся `null` → `referredBy` не записывается → бонус не начисляется.

### Решение

Добавить backend API для резолва реферального кода (без требования аутентификации или с минимальной проверкой):

```
GET /api/referral/resolve?code=ABC12345
→ { inviterId: "uid..." } или 404
```

Клиент вызывает этот API вместо прямого запроса к Firestore.

---

## Проблема 2: processReferralBonus использует неверный baseUrl

### Причина

```javascript
// referralService.js, строка 126
const baseUrl = typeof window !== 'undefined' && window.location?.origin ? '' : (process.env.VITE_API_BASE_URL || '')
```

- В браузере всегда используется `''` (относительный URL).
- `process.env.VITE_API_BASE_URL` в Vite не используется — нужен `import.meta.env.VITE_API_BASE_URL`.
- Остальные сервисы используют `getApiBaseUrl()`.

Если фронт и API на разных доменах (например, CDN и отдельный backend), запрос уходит на origin фронта и даёт 404.

### Решение

Использовать `getApiBaseUrl()`:

```javascript
import { getApiBaseUrl } from '../../../shared/utils/apiBase.js'
// ...
const baseUrl = getApiBaseUrl()
const url = `${baseUrl}/api/referral/process`
```

---

## Проблема 3: Ссылка не у всех пользователей

### Возможные причины

1. **Race condition**  
   Код создаётся в `useEffect` асинхронно. Пользователь может открыть вкладку «Подписки» до того, как `getOrCreateReferralCode` отработает и обновит `currentUser.referralCode`.

2. **Блок только во вкладке «Подписки»**  
   Реферальный блок показывается только при `dashboardTab === 'subscription'`. Если пользователь по умолчанию попадает в другой таб, он может не заметить блок.

3. **Ошибка при создании кода**  
   `getOrCreateReferralCode` может вернуть `''` при ошибке (например, при проблемах с Firestore). В этом случае ссылка остаётся «…».

4. **Проверка уникальности кода**  
   Запрос `where('referralCode', '==', code)` из‑за правил Firestore возвращает только документы, доступные текущему пользователю. Полная проверка уникальности невозможна, возможны дубликаты кодов.

### Решение

- Показывать индикатор загрузки, пока код не создан.
- Рассмотреть вынос реферального блока в отдельную вкладку или отображение на всех вкладках.
- Добавить backend API для создания/получения реферального кода (как для резолва).

---

## Проблема 4: Google Sign-In и сохранение ref

### Текущее поведение

- `?ref=` сохраняется в `sessionStorage` при загрузке.
- При `signInWithRedirect` пользователь уходит на Google и возвращается.
- После редиректа `?ref=` в URL может пропасть, но `sessionStorage` сохраняется в той же вкладке.

В целом сохранение ref при Google Sign-In должно работать, но стоит проверить в реальных сценариях (особенно в мобильных браузерах).

---

## Рекомендуемые исправления

### 1. Backend: API для резолва реферального кода

```javascript
// n8n-webhook-proxy.js
app.get('/api/referral/resolve', async (req, res) => {
  const code = (req.query.code || '').trim()
  if (!code || code.length < 6) {
    return res.status(400).json({ success: false, error: 'Неверный код' })
  }
  const usersRef = db.collection(`artifacts/${APP_ID}/public/data/users_v4`)
  const snap = await usersRef.where('referralCode', '==', code).limit(1).get()
  if (snap.empty) {
    return res.status(404).json({ success: false, error: 'Код не найден' })
  }
  return res.json({ inviterId: snap.docs[0].id })
})
```

### 2. Фронт: вызывать API вместо Firestore

В `referralService.js` добавить `resolveReferralCodeViaApi(code)` и использовать его при регистрации вместо `resolveReferralCode(db, code)`.

### 3. Фронт: единый baseUrl для API

В `processReferralBonus` заменить кастомный `baseUrl` на `getApiBaseUrl()`.

### 4. UX: индикатор загрузки реферального кода

В Dashboard показывать «Загрузка…» вместо «…», пока `referralCode` не получен.

---

## Схема текущего потока (с ошибками)

```
Регистрация по ref-ссылке:
1. Пользователь на ?ref=ABC123
2. ref сохраняется в state + sessionStorage ✓
3. Пользователь заполняет форму и нажимает «Зарегистрироваться»
4. resolveReferralCode(db, "ABC123") → Firestore query → permission-denied ✗
5. inviterId = null
6. createUserWithEmailAndPassword ✓
7. setDoc с referredBy: undefined (inviterId пустой) ✗
8. processReferralBonus не вызывается (нет inviterId) ✗
9. Бонус не начисляется ✗
```

## Схема исправленного потока

```
1. Пользователь на ?ref=ABC123
2. ref сохраняется в state + sessionStorage ✓
3. Пользователь заполняет форму
4. fetch('/api/referral/resolve?code=ABC123') → { inviterId: "uid..." } ✓
5. createUserWithEmailAndPassword ✓
6. setDoc с referredBy: inviterId ✓
7. processReferralBonus(idToken, newUserId, inviterId) ✓
8. Backend начисляет бонус ✓
```
