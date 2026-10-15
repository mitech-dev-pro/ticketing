-- One-time local setup for native MySQL 8 (no Docker).
-- Run as an administrative user, e.g.:
--   "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < scripts/setup-mysql-local.sql
-- Safe to re-run (idempotent).

CREATE DATABASE IF NOT EXISTS milife_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS milife_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Prisma Migrate's shadow database gets wiped and recreated on every `migrate dev`
-- run. It normally picks a random name (prisma_migrate_shadow_db_<uuid>), which
-- would NOT match the milife_* grant below, so we pin a fixed name instead via
-- SHADOW_DATABASE_URL in .env / .env.test.
CREATE DATABASE IF NOT EXISTS milife_shadow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS milife_test_shadow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A dedicated app user, scoped to milife_* databases only (this wildcard matches
-- milife_dev, milife_test, milife_shadow and milife_test_shadow).
CREATE USER IF NOT EXISTS 'milife_app'@'localhost' IDENTIFIED BY 'nFlvZhmcSqmvG_wE';
GRANT ALL PRIVILEGES ON `milife\_%`.* TO 'milife_app'@'localhost';
FLUSH PRIVILEGES;
