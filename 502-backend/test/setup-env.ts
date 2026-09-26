import { readFileSync } from 'fs';
import { join } from 'path';
import { parseEnv } from 'util';

// E2E runs against a disposable database (see test/e2e.env). Loaded before
// any module so Prisma does not pick up the developer's .env. (Assigning
// keys by hand: process.loadEnvFile does not reach Jest's sandboxed env.)
Object.assign(
  process.env,
  parseEnv(readFileSync(join(__dirname, 'e2e.env'), 'utf8')),
);
