import { readUpload, route } from "@/server/http";
import { uploadStepDocument } from "@/server/requests/engine";

/** multipart: file, validTo?, comment? */
export const POST = route<{ id: string }>(async ({ actor, req, params }) => {
  const { file, fields } = await readUpload(req);
  return uploadStepDocument(actor, params.id, file, { validTo: fields.validTo || null, comment: fields.comment || null });
});
