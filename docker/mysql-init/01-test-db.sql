-- A second database for the integration suite (npm run test:mysql), so tests never touch real data.
CREATE DATABASE IF NOT EXISTS home_monitor_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON home_monitor_test.* TO 'monitor'@'%';
FLUSH PRIVILEGES;
