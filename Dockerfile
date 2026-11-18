# Keshav — admin panel (/) + PHP API (/api) in one container. Used by Railway; works anywhere Docker runs.

# 1) Build the React admin panel
FROM node:22-alpine AS admin
WORKDIR /app
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY admin/ ./
ENV VITE_API_URL=/api
RUN npm run build

# 2) PHP + Apache runtime
FROM php:8.3-apache
RUN apt-get update && apt-get install -y --no-install-recommends libcurl4-openssl-dev libonig-dev \
 && docker-php-ext-install pdo_mysql mbstring \
 && a2enmod rewrite headers \
 && rm -rf /var/lib/apt/lists/*
RUN { echo 'upload_max_filesize=20M'; echo 'post_max_size=25M'; echo 'memory_limit=256M'; echo 'expose_php=Off'; } > /usr/local/etc/php/conf.d/keshav.ini \
 && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

COPY backend/ /var/www/backend/
COPY --from=admin /app/dist/ /var/www/html/
# API lives at /api → backend/public (index.php + .htaccess)
RUN ln -s /var/www/backend/public /var/www/html/api \
 && mkdir -p /var/www/backend/storage/uploads /var/www/backend/storage/logs \
 && chown -R www-data:www-data /var/www/backend/storage

COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh
CMD ["start.sh"]
