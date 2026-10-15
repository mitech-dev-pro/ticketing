import { config } from 'dotenv';

// Integration tests (Phase 1+) run against the milife_test database.
config({ path: '.env.test', override: true });
