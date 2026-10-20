"use client";

export type ApiError = { code: string; message?: string; details?: unknown };

export class ApiRequestError extends Error {
  constructor(public readonly error: ApiError, public readonly status: number) {
    super(error.code);
  }
}

/** Client-side calls to /api/v1. Permission checks happen on the server; this only shuttles JSON. */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(json.error ?? { code: "internal_error" }, res.status);
  return json.data as T;
}

/** Field-level messages from a 422, flattened to "field: problem" lines. */
export function errorDetails(err: unknown): string[] {
  if (!(err instanceof ApiRequestError)) return [];
  const d = err.error.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | Record<string, string> | string[] | undefined;
  if (!d) return [];
  if (Array.isArray(d)) return d.map(String);
  if ("fieldErrors" in d && d.fieldErrors) {
    return [...(d.formErrors ?? []), ...Object.entries(d.fieldErrors).map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)];
  }
  return Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
}
