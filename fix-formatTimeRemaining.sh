#!/bin/bash

# Скрипт для исправления конфликта formatTimeRemaining в Dashboard.jsx
# 1. Удаляет дублирующие импорты formatTimeRemaining
# 2. Удаляет formatTimeRemaining из пропсов компонента Dashboard

set -e

DASHBOARD_FILE="src/features/dashboard/components/Dashboard.jsx"
PROJECT_DIR="${1:-$(pwd)}"

cd "$PROJECT_DIR" || {
    echo "❌ Не удалось перейти в директорию $PROJECT_DIR"
    exit 1
}

if [ ! -f "$DASHBOARD_FILE" ]; then
    echo "❌ Файл $DASHBOARD_FILE не найден в $PROJECT_DIR"
    exit 1
fi

echo "🔍 Проверяю файл $DASHBOARD_FILE..."

# Создаем резервную копию
BACKUP_FILE="${DASHBOARD_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$DASHBOARD_FILE" "$BACKUP_FILE"
echo "📋 Резервная копия создана: $BACKUP_FILE"

# ШАГ 1: Удаляем дублирующие импорты formatTimeRemaining
echo ""
echo "🔍 ШАГ 1: Проверяю дублирующие импорты..."

# Находим все импорты из formatDate.js
IMPORTS_FROM_FORMATDATE=$(grep -n "from '../../../shared/utils/formatDate.js'" "$DASHBOARD_FILE" || true)

if [ -n "$IMPORTS_FROM_FORMATDATE" ]; then
    echo "Найдены импорты из formatDate.js:"
    echo "$IMPORTS_FROM_FORMATDATE"
    
    # Подсчитываем количество импортов
    IMPORT_COUNT=$(echo "$IMPORTS_FROM_FORMATDATE" | wc -l)
    
    if [ "$IMPORT_COUNT" -gt 1 ]; then
        echo "⚠️  Найдено $IMPORT_COUNT импорта из formatDate.js. Объединяю в один..."
        
        # Находим строки с импортами
        IMPORT_LINES=$(echo "$IMPORTS_FROM_FORMATDATE" | cut -d: -f1 | sort -n)
        FIRST_IMPORT_LINE=$(echo "$IMPORT_LINES" | head -1)
        OTHER_IMPORT_LINES=$(echo "$IMPORT_LINES" | tail -n +2)
        
        # Читаем первый импорт
        FIRST_IMPORT=$(sed -n "${FIRST_IMPORT_LINE}p" "$DASHBOARD_FILE")
        
        # Извлекаем все импортируемые функции из всех строк
        ALL_IMPORTS=$(echo "$IMPORTS_FROM_FORMATDATE" | sed 's/.*import { \(.*\) }.*/\1/' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -u | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
        
        # Создаем объединенный импорт
        UNIFIED_IMPORT="import { $ALL_IMPORTS } from '../../../shared/utils/formatDate.js'"
        
        echo "Объединенный импорт: $UNIFIED_IMPORT"
        
        # Заменяем первый импорт на объединенный
        sed -i "${FIRST_IMPORT_LINE}s/.*/$UNIFIED_IMPORT/" "$DASHBOARD_FILE"
        
        # Удаляем остальные дублирующие импорты (в обратном порядке, чтобы номера строк не сдвигались)
        for LINE in $(echo "$OTHER_IMPORT_LINES" | sort -rn); do
            sed -i "${LINE}d" "$DASHBOARD_FILE"
            echo "✅ Удален дублирующий импорт на строке $LINE"
        done
        
        echo "✅ Дублирующие импорты удалены"
    else
        echo "✅ Дублирующих импортов не найдено"
    fi
else
    echo "⚠️  Импорты из formatDate.js не найдены. Добавляю..."
    # Находим последний импорт
    LAST_IMPORT_LINE=$(grep -n "^import" "$DASHBOARD_FILE" | tail -1 | cut -d: -f1)
    if [ -n "$LAST_IMPORT_LINE" ]; then
        sed -i "${LAST_IMPORT_LINE}a\\
import { formatDate, formatTimeRemaining, getTimeRemaining } from '../../../shared/utils/formatDate.js'
" "$DASHBOARD_FILE"
        echo "✅ Импорт добавлен"
    fi
fi

# ШАГ 2: Удаляем formatTimeRemaining из пропсов
echo ""
echo "🔍 ШАГ 2: Проверяю пропсы компонента..."

if grep -A 50 "const Dashboard = ({" "$DASHBOARD_FILE" | grep -q "formatTimeRemaining"; then
    echo "⚠️  Найдено formatTimeRemaining в пропсах. Удаляю..."
    
    # Используем sed для удаления formatTimeRemaining из пропсов
    # Удаляем строки с formatTimeRemaining между const Dashboard = ({ и }) => {
    sed -i.tmp '/const Dashboard = ({/,/}) => {/{
        /^\s*formatTimeRemaining\s*,/d
        /^\s*formatTimeRemaining\s*$/d
        s/,\s*formatTimeRemaining\s*,/,/g
        s/,\s*formatTimeRemaining\s*$//g
    }' "$DASHBOARD_FILE"
    
    # Исправляем двойные запятые
    sed -i.tmp2 's/,\s*,/,/g' "$DASHBOARD_FILE"
    # Исправляем запятую перед закрывающей скобкой пропсов
    sed -i.tmp3 's/,\s*}) => {/) => {/g' "$DASHBOARD_FILE"
    
    rm -f "${DASHBOARD_FILE}.tmp" "${DASHBOARD_FILE}.tmp2" "${DASHBOARD_FILE}.tmp3"
    echo "✅ formatTimeRemaining удален из пропсов"
else
    echo "✅ formatTimeRemaining не найден в пропсах"
fi

echo ""
echo "✅ Проверка завершена!"
echo "📝 Резервная копия: $BACKUP_FILE"
echo ""
echo "🔍 Финальная проверка:"

# Проверяем импорты
IMPORT_COUNT=$(grep "from '../../../shared/utils/formatDate.js'" "$DASHBOARD_FILE" | wc -l)
if [ "$IMPORT_COUNT" -gt 1 ]; then
    echo "❌ ОШИБКА: Все еще найдено $IMPORT_COUNT импорта из formatDate.js!"
    echo "   Пожалуйста, исправьте вручную, оставив только один импорт"
    exit 1
else
    echo "✅ Найден только один импорт из formatDate.js"
fi

# Проверяем пропсы
if grep -A 50 "const Dashboard = ({" "$DASHBOARD_FILE" | grep -q "formatTimeRemaining"; then
    echo "❌ ОШИБКА: formatTimeRemaining все еще в пропсах!"
    echo "   Пожалуйста, исправьте файл вручную"
    exit 1
else
    echo "✅ formatTimeRemaining НЕ найден в пропсах"
fi

# Проверяем наличие импорта
if grep -q "import.*formatTimeRemaining" "$DASHBOARD_FILE"; then
    echo "✅ Импорт formatTimeRemaining найден"
else
    echo "❌ ОШИБКА: Импорт formatTimeRemaining не найден!"
    exit 1
fi

echo ""
echo "🎉 Файл исправлен успешно!"
