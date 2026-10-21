"use server";

import { signIn } from "@/auth";
import { getActor } from "@/server/auth/session";
import { ValidationError } from "@/server/errors";
import { changeOwnPassword } from "@/server/services/users";

export type ChangeState = { error: string | null };

/** Changes the password, then signs in again with it (the change ends every session, this one included). */
export async function changePasswordAction(_prev: ChangeState, form: FormData): Promise<ChangeState> {
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "mismatch" };
  const actor = await getActor();
  let email: string;
  try {
    ({ email } = await changeOwnPassword(actor, { current: String(form.get("current") ?? ""), next }));
  } catch (err) {
    if (err instanceof ValidationError) {
      const details = (err.details ?? {}) as Record<string, string>;
      return { error: details.current ?? details.next ?? "invalid" };
    }
    throw err;
  }
  await signIn("password", { email, password: next, redirectTo: "/" });
  return { error: null };
}
