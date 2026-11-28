#!/bin/sh
# BigRock (keshavkunj.com) — runs from cPanel cron every 2 minutes.
# The document root is a git checkout of the `deploy-bigrock` branch (built by GitHub Actions).
# Pulls the latest build; after a new build, runs the idempotent DB installer/migrations.
SITE=/home4/leadztpx/keshavkunj.com
GIT=/usr/local/cpanel/3rdparty/bin/git; [ -x "$GIT" ] || GIT=git
PHP=/opt/cpanel/ea-php83/root/usr/bin/php; [ -x "$PHP" ] || PHP=php

cd "$SITE" || exit 1
mkdir -p api/storage/uploads api/storage/logs
old=$($GIT rev-parse HEAD 2>/dev/null)
$GIT fetch -q origin deploy-bigrock && $GIT reset -q --hard origin/deploy-bigrock
new=$($GIT rev-parse HEAD 2>/dev/null)
if [ "$old" != "$new" ] && [ -f api/config/config.php ]; then
  echo "$(date '+%F %T') deployed $new" >> api/storage/logs/deploy.log
  $PHP api/database/install.php >> api/storage/logs/deploy.log 2>&1
fi
