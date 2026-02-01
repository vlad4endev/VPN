#!/usr/bin/env node
/**
 * Установка custom claim admin: true. CommonJS — работает без "type": "module".
 * На сервере: node set-admin-claim.cjs --migrate
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, 'firebase-service-account.json');

try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('✅ Firebase Admin SDK инициализирован');
} catch (error) {
  console.error('❌ Ошибка инициализации Firebase Admin SDK:', error.message);
  console.error('Убедитесь, что firebase-service-account.json в папке server/ или задайте FIREBASE_SERVICE_ACCOUNT_PATH');
  process.exit(1);
}

const db = admin.firestore();

async function setAdminClaim(email) {
  try {
    console.log('\n🔍 Поиск пользователя с email:', email);
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    console.log('✅ Пользователь найден:', uid);
    const currentClaims = userRecord.customClaims || {};
    console.log('📋 Текущие custom claims:', currentClaims);
    if (currentClaims.admin === true) {
      console.log('⚠️  Пользователь уже имеет admin claim');
      return;
    }
    await admin.auth().setCustomUserClaims(uid, { ...currentClaims, admin: true });
    console.log('✅ Admin claim установлен');
    const userDocRef = db.doc('artifacts/skyputh/public/data/users_v4/' + uid);
    const userDoc = await userDocRef.get();
    if (userDoc.exists) {
      await userDocRef.update({ role: 'admin', updatedAt: new Date().toISOString() });
      console.log('✅ Роль admin установлена в Firestore');
    } else {
      console.log('⚠️  Документ пользователя не найден в Firestore');
    }
    const updatedUser = await admin.auth().getUser(uid);
    console.log('📋 Обновленные custom claims:', updatedUser.customClaims);
    console.log('\n✅ Готово! Пользователь должен перелогиниться для применения изменений.');
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

async function migrateAllAdmins() {
  try {
    console.log('\n🔍 Поиск всех администраторов в Firestore...');
    const usersSnapshot = await db
      .collection('artifacts/skyputh/public/data/users_v4')
      .where('role', '==', 'admin')
      .get();
    console.log('✅ Найдено администраторов:', usersSnapshot.size);
    let successCount = 0;
    let errorCount = 0;
    for (const doc of usersSnapshot.docs) {
      const uid = doc.id;
      const userData = doc.data();
      try {
        console.log('\n📝 Обработка пользователя:', userData.email, '(' + uid + ')');
        const userRecord = await admin.auth().getUser(uid);
        const currentClaims = userRecord.customClaims || {};
        if (currentClaims.admin === true) {
          console.log('  ⏭️  Уже имеет admin claim, пропускаем');
          successCount++;
          continue;
        }
        await admin.auth().setCustomUserClaims(uid, { ...currentClaims, admin: true });
        console.log('  ✅ Admin claim установлен');
        successCount++;
      } catch (error) {
        console.error('  ❌ Ошибка для', uid + ':', error.message);
        errorCount++;
      }
    }
    console.log('\n📊 Результаты миграции:');
    console.log('  ✅ Успешно:', successCount);
    console.log('  ❌ Ошибок:', errorCount);
    console.log('\n✅ Миграция завершена! Пользователи должны перелогиниться для применения изменений.');
  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    process.exit(1);
  }
}

async function showUserInfo(email) {
  try {
    console.log('\n🔍 Информация о пользователе:', email);
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;
    console.log('\n📋 Firebase Auth:');
    console.log('  UID:', uid);
    console.log('  Email:', userRecord.email);
    console.log('  Display Name:', userRecord.displayName || 'не установлено');
    console.log('  Custom Claims:', userRecord.customClaims || 'отсутствуют');
    const userDocRef = db.doc('artifacts/skyputh/public/data/users_v4/' + uid);
    const userDoc = await userDocRef.get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      console.log('\n📋 Firestore:');
      console.log('  Role:', userData.role);
      console.log('  Plan:', userData.plan);
      console.log('  Created:', userData.createdAt);
    } else {
      console.log('\n⚠️  Документ не найден в Firestore');
    }
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
Использование (из папки server/):
  node set-admin-claim.cjs <email>         - Установить admin claim
  node set-admin-claim.cjs --migrate       - Мигрировать всех администраторов
  node set-admin-claim.cjs --info <email> - Информация о пользователе
`);
  process.exit(0);
}

(async () => {
  try {
    if (command === '--migrate') {
      await migrateAllAdmins();
    } else if (command === '--info') {
      const email = args[1];
      if (!email) {
        console.error('❌ Укажите email пользователя');
        process.exit(1);
      }
      await showUserInfo(email);
    } else {
      await setAdminClaim(command);
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Неожиданная ошибка:', error);
    process.exit(1);
  }
})();
