// Integration tests run against a separate database (created by `npm run db`).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/people_os_test";
