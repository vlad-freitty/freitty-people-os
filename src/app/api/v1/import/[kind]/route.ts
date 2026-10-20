import { readJson, route } from "@/server/http";
import { runImport } from "@/server/services/import";

/** Body: { csv: string, commit?: boolean }. Without commit it only previews. */
export const POST = route<{ kind: string }>(async ({ actor, req, params }) => {
  const body = (await readJson(req)) as { csv?: unknown; commit?: unknown };
  return runImport(actor, params.kind, String(body.csv ?? ""), body.commit === true);
});
