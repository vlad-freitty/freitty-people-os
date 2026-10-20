import { readSignedFile } from "@/server/services/files";

/** Short-lived signed link (5 min), the same contract an S3 presigned URL would have. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const file = await readSignedFile((await params).token);
  if (!file) return new Response("Link expired or invalid", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
