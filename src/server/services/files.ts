import type { Actor } from "@/server/authz/actor";
import { ForbiddenError } from "@/server/errors";
import { assertFile, type UploadedFile } from "@/server/services/documents";
import { fileRefToken, newFileKey, storage, verifyFileToken } from "@/server/storage";

/** Upload for request form "file" fields. The returned reference (with token) goes into the form value. */
export async function uploadFormFile(actor: Actor, file: UploadedFile | null) {
  if (!actor.employeeId) throw new ForbiddenError("an employee profile is required");
  assertFile(file);
  const fileKey = newFileKey(`request-files/${actor.employeeId}`, file.name);
  await storage.put(fileKey, file.data);
  return {
    fileKey,
    fileName: file.name.slice(0, 200),
    mimeType: file.type || "application/octet-stream",
    size: file.data.length,
    token: fileRefToken(fileKey),
  };
}

export async function readSignedFile(token: string) {
  const ref = verifyFileToken(token);
  if (!ref) return null;
  try {
    return { ...ref, data: await storage.get(ref.fileKey) };
  } catch {
    return null;
  }
}
