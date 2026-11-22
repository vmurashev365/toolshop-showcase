#!/usr/bin/env bash
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
checkout=${1:?Pass a new directory for the isolated Toolshop checkout.}
revision=$(tr -d '\r\n' < "$script_dir/toolshop-revision.txt")
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
export SPRINT=sprint5 DISABLE_LOGGING=true

mkdir -p -- "$(dirname -- "$checkout")"
mkdir -- "$checkout"
cd -- "$checkout"
checkout_dir=$PWD
git -c core.autocrlf=false init --quiet
git -c core.autocrlf=false fetch --depth 1 https://github.com/testsmith-io/practice-software-testing.git "$revision"
git -c core.autocrlf=false checkout --quiet --detach FETCH_HEAD
test "$(git rev-parse HEAD)" = "$revision"
echo "Toolshop Sprint 5 revision: $(git rev-parse HEAD)"

# The development image installs PHP coverage tools that are disabled for QA.
git apply "$script_dir/toolshop-no-coverage.patch"

compose() {
  docker compose --project-name toolshop-qa --project-directory "$checkout_dir" \
    -f "$checkout_dir/docker-compose.yml" -f "$script_dir/toolshop-compose.yml" "$@"
}
dump_logs() {
  local status=$?
  echo "Toolshop startup failed (exit $status). Docker Compose status and logs:"
  compose ps -a || true
  compose logs --tail=80 mariadb laravel-api web angular-ui || true
  exit "$status"
}
trap dump_logs ERR

wait_for() {
  local label=$1 attempts=$2 delay=$3 result
  shift 3
  for (( attempt = 1; attempt <= attempts; attempt++ )); do
    if result=$("$@" 2>&1); then
      echo "$label is ready."
      return 0
    fi
    sleep "$delay"
  done
  echo "$label did not become ready. Last check: $result" >&2
  return 1
}

# The upstream Composer service shares the API bind mount. Install in the API container instead.
compose up -d mariadb laravel-api web angular-ui
wait_for MariaDB 45 2 compose exec -T laravel-api php -r \
  "new PDO('mysql:host=mariadb;port=3306;dbname=toolshop', 'user', 'root');"

compose exec -T -u root laravel-api sh -c \
  'chown -R www-data:www-data /var/www && chmod -R 775 /var/www/storage /var/www/bootstrap/cache'
composer_env=()
if [[ -n ${GITHUB_TOKEN:-} ]]; then
  composer_env=(-e "COMPOSER_AUTH={\"github-oauth\":{\"github.com\":\"$GITHUB_TOKEN\"}}")
fi
# Bash before 4.4 (macOS /bin/bash 3.2) treats an empty "${array[@]}" as unbound under set -u.
compose exec -T ${composer_env[@]+"${composer_env[@]}"} laravel-api \
  composer install --no-dev --optimize-autoloader --no-interaction --ignore-platform-req=ext-ffi
compose exec -T laravel-api php artisan migrate:refresh --seed --force

cd -- "$script_dir/.."
wait_for 'Toolshop API and UI' 60 5 env TARGET_ENV=local \
  UI_BASE_URL=http://127.0.0.1:4200 API_BASE_URL=http://127.0.0.1:8091 \
  node --import tsx scripts/check-local-toolshop.ts
