import type { DocumentType } from "@prisma/client";
import { z } from "zod";
import { isIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { assertCan, can } from "@/server/authz/policy";
import { prisma, type Tx } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { MAX_FILE_SIZE, newFileKey, signedFileUrl, storage } from "@/server/storage";

// Documents are sensitive (PRD 2): reading needs employees.view_sensitive on the person, uploading needs employees.edit.
// The request engine creates documents from "document" steps through createDocument() directly.

export const DOCUMENT_TYPES = ["contract", "nda", "act", "invoice", "w9", "other"] as const;

const metaInput = z.object({
  type: z.enum(DOCUMENT_TYPES),
  period: z.string().trim().max(50).nullish(),
  validFrom: z.string().refine(isIsoDate).nullish(),
  validTo: z.string().refine(isIsoDate).nullish(),
});

export type UploadedFile = { name: string; type: string; data: Buffer };

export function assertFile(file: UploadedFile | null): asserts file is UploadedFile {
  if (!file || file.data.length === 0) throw new ValidationError({ file: "required" });
  if (file.data.length > MAX_FILE_SIZE) throw new ValidationError({ file: "too_large" });
}

export async function createDocument(
  tx: Tx,
  actor: Actor,
  input: {
    employee: { id: string; departmentId: string };
    type: DocumentType;
    file: UploadedFile;
    period?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    requestId?: string | null;
  },
) {
  const fileKey = newFileKey(`documents/${input.employee.id}`, input.file.name);
  await storage.put(fileKey, input.file.data);
  const doc = await tx.document.create({
    data: {
      employeeId: input.employee.id,
      type: input.type,
      fileKey,
      fileName: input.file.name.slice(0, 200),
      mimeType: input.file.type || "application/octet-stream",
      size: input.file.data.length,
      period: input.period ?? null,
      validFrom: input.validFrom ? parseIsoDate(input.validFrom) : null,
      validTo: input.validTo ? parseIsoDate(input.validTo) : null,
      requestId: input.requestId ?? null,
      createdById: actor.userId,
    },
  });
  await audit(tx, actor, {
    action: "document.create",
    entity: "Document",
    entityId: doc.id,
    after: { type: doc.type, fileName: doc.fileName, validTo: toIsoDate(doc.validTo) },
    departmentId: input.employee.departmentId,
    employeeId: input.employee.id,
  });
  return doc;
}

export async function uploadDocument(actor: Actor, employeeId: string, raw: unknown, file: UploadedFile | null) {
  const meta = metaInput.parse(raw);
  assertFile(file);
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e) throw new NotFoundError("employee");
  assertCan(actor, "employees.edit", { employeeId: e.id, departmentId: e.departmentId });
  const doc = await prisma.$transaction((tx) => createDocument(tx, actor, { ...meta, employee: e, file }));
  return toDto(doc);
}

function toDto(d: { id: string; type: DocumentType; fileName: string; mimeType: string; size: number; fileKey: string; period: string | null; validFrom: Date | null; validTo: Date | null; status: string; requestId: string | null; createdAt: Date }, today = new Date()) {
  const expired = !!d.validTo && d.validTo < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return {
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    size: d.size,
    period: d.period,
    validFrom: toIsoDate(d.validFrom),
    validTo: toIsoDate(d.validTo),
    status: d.status === "active" && expired ? "expired" : d.status,
    requestId: d.requestId,
    createdAt: d.createdAt.toISOString(),
    url: signedFileUrl(d),
  };
}

export async function listDocuments(actor: Actor, employeeId: string) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e || !can(actor, "employees.view_sensitive", { employeeId: e.id, departmentId: e.departmentId })) throw new NotFoundError("employee");
  const docs = await prisma.document.findMany({ where: { employeeId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  return docs.map((d) => toDto(d));
}
