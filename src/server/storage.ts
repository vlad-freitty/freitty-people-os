import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private file storage (PRD 9, rule 5). Files are never public: clients get a short-lived signed link.
 * Dev/test: local directory. Production: an S3-compatible bucket implementing the same interface
 * (provider to be chosen together with hosting — see CLAUDE.md).
 */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }
}

export const storage: Storage = new LocalStorage(process.env.STORAGE_DIR ?? ".uploads");

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
const LINK_TTL_SECONDS = 5 * 60;

export function newFileKey(prefix: string, fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  return `${prefix}/${randomUUID()}${ext}`;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Proof that a file key came from our upload endpoint — form values carry it back on submit. */
export function fileRefToken(fileKey: string) {
  return sign(`ref:${fileKey}`);
}

export function verifyFileRef(fileKey: string, token: string) {
  const expected = Buffer.from(fileRefToken(fileKey));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Signed link valid for 5 minutes. The file route checks signature and expiry only. */
export function signedFileUrl(file: { fileKey: string; fileName: string; mimeType: string }, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ k: file.fileKey, n: file.fileName, t: file.mimeType, exp })).toString("base64url");
  return `/api/v1/files/${payload}.${sign(payload)}`;
}

export function verifyFileToken(token: string, now = Date.now()) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { k: string; n: string; t: string; exp: number };
  if (data.exp * 1000 < now) return null;
  return { fileKey: data.k, fileName: data.n, mimeType: data.t };
}
