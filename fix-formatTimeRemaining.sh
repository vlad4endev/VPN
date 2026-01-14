#!/bin/bash

# Скрипт для исправления конфликта formatTimeRemaining в Dashboard.jsx
# Удаляет formatTimeRemaining из пропсов компонента Dashboard

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

# Используем awk для более точной обработки
awk '
BEGIN { in_props = 0; props_start = 0; found_in_props = 0 }
/const Dashboard = \(\{/ { 
    in_props = 1
    props_start = NR
    print
    next
}
in_props && /formatTimeRemaining/ && !/import.*formatTimeRemaining/ {
    # Это formatTimeRemaining в пропсах, пропускаем эту строку
    found_in_props = 1
    # Проверяем, не является ли это последним параметром перед закрывающей скобкой
    if (/,\s*$/) {
        # Если строка заканчивается запятой, просто пропускаем
        next
    }
    # Если это последний параметр без запятой, нужно удалить запятую из предыдущей строки
    # Но это сложно, поэтому просто пропускаем строку
    next
}
/\}\) => \{/ {
    if (in_props) {
        in_props = 0
    }
    print
    next
}
{ print }
END {
    if (found_in_props) {
        print "✅ formatTimeRemaining удален из пропсов" > "/dev/stderr"
    }
}
' "$DASHBOARD_FILE" > "${DASHBOARD_FILE}.tmp" && mv "${DASHBOARD_FILE}.tmp" "$DASHBOARD_FILE"

# Проверяем результат
if grep -A 50 "const Dashboard = ({" "$DASHBOARD_FILE" | grep -q "formatTimeRemaining"; then
    echo "⚠️  formatTimeRemaining все еще найден в пропсах. Используем более агрессивный метод..."
    
    # Используем sed для удаления строк с formatTimeRemaining между const Dashboard = ({ и }) => {
    sed -i.tmp2 '/const Dashboard = ({/,/}) => {/{
        /^\s*formatTimeRemaining\s*,/d
        /^\s*formatTimeRemaining\s*$/d
        /,\s*formatTimeRemaining\s*,/s/,\s*formatTimeRemaining\s*,/,/g
        /,\s*formatTimeRemaining\s*$/s/,\s*formatTimeRemaining\s*$//g
    }' "$DASHBOARD_FILE"
    
    # Исправляем двойные запятые
    sed -i.tmp3 's/,\s*,/,/g' "$DASHBOARD_FILE"
    # Исправляем запятую перед закрывающей скобкой пропсов
    sed -i.tmp4 's/,\s*}) => {/) => {/g' "$DASHBOARD_FILE"
    
    rm -f "${DASHBOARD_FILE}.tmp2" "${DASHBOARD_FILE}.tmp3" "${DASHBOARD_FILE}.tmp4"
fi

# Проверяем, что импорт есть
if ! grep -q "import { formatTimeRemaining" "$DASHBOARD_FILE"; then
    echo "⚠️  Импорт formatTimeRemaining не найден. Добавляю..."
    # Находим последний импорт перед const Dashboard
    LAST_IMPORT_LINE=$(grep -n "^import" "$DASHBOARD_FILE" | tail -1 | cut -d: -f1)
    if [ -n "$LAST_IMPORT_LINE" ]; then
        sed -i "${LAST_IMPORT_LINE}a\\
import { formatTimeRemaining, getTimeRemaining } from '../../../shared/utils/formatDate.js'
" "$DASHBOARD_FILE"
        echo "✅ Импорт добавлен"
    fi
fi

echo ""
echo "✅ Проверка завершена!"
echo "📝 Резервная копия: $BACKUP_FILE"
echo ""
echo "🔍 Финальная проверка:"
if grep -A 50 "const Dashboard = ({" "$DASHBOARD_FILE" | grep -q "formatTimeRemaining"; then
    echo "❌ ОШИБКА: formatTimeRemaining все еще в пропсах!"
    echo "   Пожалуйста, исправьте файл вручную:"
    echo "   1. Откройте $DASHBOARD_FILE"
    echo "   2. Найдите строку с formatTimeRemaining в пропсах (после const Dashboard = ({)"
    echo "   3. Удалите эту строку"
    exit 1
else
    echo "✅ formatTimeRemaining НЕ найден в пропсах - все правильно!"
fi

if grep -q "import { formatTimeRemaining" "$DASHBOARD_FILE"; then
    echo "✅ Импорт formatTimeRemaining найден"
else
    echo "❌ ОШИБКА: Импорт formatTimeRemaining не найден!"
    exit 1
fi

echo ""
echo "🎉 Файл исправлен успешно!"
