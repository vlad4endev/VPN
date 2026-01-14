module.exports = {
  // Проверка на наличие секретов
  '*.{js,jsx,ts,tsx,json,env}': [
    'node scripts/check-secrets.js || true'
  ]
}
