import { readUpload, route } from "@/server/http";
import { listDocuments, uploadDocument } from "@/server/services/documents";

type P = { id: string };

export const GET = route<P>(({ actor, params }) => listDocuments(actor, params.id));
/** multipart: file, type, period?, validFrom?, validTo? */
export const POST = route<P>(async ({ actor, req, params }) => {
  const { file, fields } = await readUpload(req);
  const meta = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === "" ? null : v]));
  return uploadDocument(actor, params.id, meta, file);
});
