#!/bin/bash
#
# Исправление прав на папку dist для успешного Vite build.
# Запускать на сервере, если сборка падает с EACCES при очистке dist.
#
# Использование:
#   sudo bash scripts/fix-dist-permissions.sh
# или (если проект в /opt/my-frontend):
#   sudo bash /opt/my-frontend/scripts/fix-dist-permissions.sh
#

set -e

# Папка проекта: либо текущая, либо переданная первым аргументом
PROJECT_ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
DIST_DIR="${PROJECT_ROOT}/dist"

# Пользователь, от которого запускается npm run build (текущий при вызове без sudo — не сработает, поэтому обычно запускают с sudo и тогда нужен целевой пользователь)
TARGET_USER="${2:-$SUDO_USER}"
TARGET_GROUP="${3:-$TARGET_USER}"

if [ -z "$TARGET_USER" ]; then
  echo "Usage: sudo $0 [project_root] [user] [group]"
  echo "  project_root  default: parent of scripts/"
  echo "  user          default: \$SUDO_USER (user who ran sudo)"
  echo "  group         default: same as user"
  echo ""
  echo "Example: sudo $0 /opt/my-frontend skyputh skyputh"
  exit 1
fi

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "Error: Project root not found: $PROJECT_ROOT"
  exit 1
fi

echo "Fixing permissions for dist at: $DIST_DIR"
echo "Owner: $TARGET_USER:$TARGET_GROUP"

if [ -d "$DIST_DIR" ]; then
  chown -R "$TARGET_USER:$TARGET_GROUP" "$DIST_DIR"
  chmod -R u+rwX "$DIST_DIR"
  echo "Done. You can run 'npm run build' as $TARGET_USER now."
else
  echo "dist/ does not exist yet. Creating with correct owner..."
  mkdir -p "$DIST_DIR"
  chown -R "$TARGET_USER:$TARGET_GROUP" "$DIST_DIR"
  chmod -R u+rwX "$DIST_DIR"
  echo "Done. Run 'npm run build' as $TARGET_USER."
fi
