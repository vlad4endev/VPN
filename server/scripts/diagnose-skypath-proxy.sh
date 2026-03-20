#!/usr/bin/env bash
# Диагностика прокси и Node на VPS (НЕ на локальном Mac).
# Запуск: bash server/scripts/diagnose-skypath-proxy.sh
# Или с VPS: bash /path/to/diagnose-skypath-proxy.sh

set -euo pipefail

echo "=== 1. Кто слушает порт 3001 ==="
if command -v ss >/dev/null 2>&1; then
  ss -tlnp | grep -E ':3001\b' || echo "(ничего на 3001 — Node не слушает или другой порт)"
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp 2>/dev/null | grep -E ':3001\b' || echo "(ничего на 3001)"
else
  echo "Установите ss (iproute2) или netstat"
fi

echo
echo "=== 2. Локальный ответ приложения (ожидается JSON) ==="
curl -sS --max-time 5 "http://127.0.0.1:3001/api/telegram/ping" | head -c 2000
echo
echo

echo "=== 3. Редирект apex → www С СОХРАНЕНИЕМ пути (смотрите Location) ==="
curl -sSI --max-time 10 "https://skypath.fun/api/telegram/ping" | head -20

echo
echo "=== 4. Канонический URL (ожидается 200 и JSON) ==="
curl -sS --max-time 10 "https://www.skypath.fun/api/telegram/ping" | head -c 2000
echo
echo

echo "Готово. Успех: в п.3 Location = https://www.skypath.fun/api/telegram/ping (или с тем же path); п.2 и п.4 — JSON от ping."
