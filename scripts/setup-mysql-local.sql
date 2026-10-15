-- One-time local setup for native MySQL 8 (no Docker).
-- Run as an administrative user, e.g.:
--   "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < scripts/setup-mysql-local.sql
-- Safe to re-run (idempotent).

CREATE DATABASE IF NOT EXISTS milife_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS milife_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A dedicated app user, scoped to milife_* databases only (covers the shadow
-- database Prisma Migrate creates and drops automatically during `migrate dev`).
CREATE USER IF NOT EXISTS 'milife_app'@'localhost' IDENTIFIED BY 'nFlvZhmcSqmvG_wE';
GRANT ALL PRIVILEGES ON `milife\_%`.* TO 'milife_app'@'localhost';
FLUSH PRIVILEGES;
