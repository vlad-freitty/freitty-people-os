import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { Actor } from "@/server/authz/actor";
import { getActor } from "@/server/auth/session";
import { AppError, ForbiddenError } from "@/server/errors";

type Ctx<P> = { actor: Actor; req: Request; params: P };

/** Every API route goes through here: session → actor → service → JSON. Services do the permission checks. */
export function route<P = Record<string, never>>(fn: (ctx: Ctx<P>) => Promise<unknown>, opts: { allowWithTemporaryPassword?: boolean } = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const actor = await getActor();
      // phase 7: with a one-time password only the password change itself is allowed
      if (actor.mustChangePassword && !opts.allowWithTemporaryPassword) throw new ForbiddenError("password_change_required");
      const result = await fn({ actor, req, params: await context.params });
      return result === undefined ? new Response(null, { status: 204 }) : Response.json({ data: result });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return Response.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return Response.json({ error: { code: "validation_failed", details: err.flatten() } }, { status: 422 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2023: malformed id (e.g. not a uuid) → treat as not found; P2002: unique violation
    if (err.code === "P2023") return Response.json({ error: { code: "not_found" } }, { status: 404 });
    if (err.code === "P2002") return Response.json({ error: { code: "conflict" } }, { status: 409 });
  }
  console.error(err);
  return Response.json({ error: { code: "internal_error" } }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function searchParams(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

/** multipart/form-data: the "file" part plus all text fields. */
export async function readUpload(req: Request) {
  const form = await req.formData();
  const part = form.get("file");
  const file =
    part && typeof part !== "string" ? { name: part.name || "file", type: part.type, data: Buffer.from(await part.arrayBuffer()) } : null;
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  return { file, fields };
}
