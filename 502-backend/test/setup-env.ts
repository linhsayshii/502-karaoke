import { readFileSync } from 'fs';
import { join } from 'path';
import { parseEnv } from 'util';

// E2E runs against a disposable database (see test/e2e.env). A globalSetup,
// not a setupFiles entry: it runs in Jest's own process before any test file,
// so TZ really sets the time zone of Date (a test file's process.env is only a
// copy: TZ set there leaves Date in the machine's zone), and each test file
// copies these values before Prisma could pick up the developer's .env.
// Assigning keys by hand: process.loadEnvFile keeps what the shell already set.
export default function setupEnv() {
  Object.assign(
    process.env,
    parseEnv(readFileSync(join(__dirname, 'e2e.env'), 'utf8')),
  );
}
