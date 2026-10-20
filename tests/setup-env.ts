import os from "node:os";
import path from "node:path";

// Integration tests run against a separate database (created by `npm run db`).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/people_os_test";
process.env.AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";
process.env.STORAGE_DIR ??= path.join(os.tmpdir(), "people-os-test-uploads");
