import { readUpload, route } from "@/server/http";
import { uploadFormFile } from "@/server/services/files";

/** Upload for request form "file" fields; returns a reference to put into the form value. */
export const POST = route(async ({ actor, req }) => uploadFormFile(actor, (await readUpload(req)).file));
