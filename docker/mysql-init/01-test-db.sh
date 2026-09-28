#!/bin/sh
# Runs on first boot of an empty data volume. DB_TEST_NAME and MYSQL_ROOT_PASSWORD
# come from .env via docker-compose.yml — nothing here is hardcoded.
set -e

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_TEST_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`$DB_TEST_NAME\`.* TO '$MYSQL_USER'@'%';
SQL
