// Local PostgreSQL without Docker or a system install (see CLAUDE.md, "Local database").
// Usage: npm run db        — starts the dev database and keeps it running
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.PGPORT ?? 5433);
const databaseDir = path.resolve(process.env.PGDATA_DIR ?? ".pgdata");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  for (const name of ["people_os_dev", "people_os_test"]) {
    try {
      await pg.createDatabase(name);
    } catch {
      // already exists
    }
  }
  console.log(`PostgreSQL is running on localhost:${port} (data: ${databaseDir}). Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
