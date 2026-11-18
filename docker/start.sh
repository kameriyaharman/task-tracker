#!/bin/sh
set -e
# Railway gives the port in $PORT
PORT="${PORT:-80}"
# php:apache uses mpm_prefork; make sure no other MPM is enabled (Railway shows "More than one MPM loaded" otherwise)
rm -f /etc/apache2/mods-enabled/mpm_event.* /etc/apache2/mods-enabled/mpm_worker.*
[ -e /etc/apache2/mods-enabled/mpm_prefork.load ] || a2enmod mpm_prefork >/dev/null
sed -i "s/^Listen .*/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:[0-9]*>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

# Persistent volume may be mounted empty at storage/
mkdir -p /var/www/backend/storage/uploads /var/www/backend/storage/logs
chown -R www-data:www-data /var/www/backend/storage

# Tables + first owner account (idempotent)
php /var/www/backend/database/install.php || echo "install step failed — API will report the error"

# Background scheduler: recurring tasks, reminders, overdue alerts (every 5 min)
( while true; do su -s /bin/sh www-data -c "php /var/www/backend/cron/run.php" || true; sleep 300; done ) &

exec apache2-foreground
