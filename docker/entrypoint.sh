#!/bin/sh
set -e
cd /var/www/html

if [ ! -f artisan ]; then
  echo "[entrypoint] artisan not found. Run the scaffold command first (create-project)." >&2
  exit 1
fi

[ -d vendor/laravel ] || composer install --no-interaction --prefer-dist

[ -f .env ] || cp .env.example .env
sed -i 's/^DB_CONNECTION=.*/DB_CONNECTION=sqlite/' .env
# MySQL 계열 접속 키는 sqlite와 무관하므로 제거
sed -i '/^DB_\(HOST\|PORT\|USERNAME\|PASSWORD\)=/d;/^DB_DATABASE=/d' .env

mkdir -p database
[ -f database/database.sqlite ] || touch database/database.sqlite

grep -q '^APP_KEY=.\+' .env || php artisan key:generate --force

# SQLite는 파일과 부모 디렉터리 모두 쓰기 가능해야 함
chmod -R a+rwX database storage bootstrap/cache 2>/dev/null || true

php artisan migrate --force

exec "$@"
