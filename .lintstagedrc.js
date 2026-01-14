module.exports = {
  // Проверка JavaScript/JSX файлов
  '*.{js,jsx}': [
    'eslint --fix',
    'prettier --write'
  ],
  // Проверка JSON файлов
  '*.json': [
    'prettier --write'
  ],
  // Проверка MD файлов
  '*.md': [
    'prettier --write'
  ],
  // Проверка на наличие секретов
  '*.{js,jsx,ts,tsx,json,env}': [
    'node scripts/check-secrets.js || true'
  ]
}
