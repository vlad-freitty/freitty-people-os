import { cache } from "react";
import { auth } from "@/auth";
import { loadActor, type Actor } from "@/server/authz/actor";
import { UnauthorizedError } from "@/server/errors";

/** Resolves the current actor once per request. Throws 401 when not signed in. */
export const getActor = cache(async (): Promise<Actor> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new UnauthorizedError();
  return loadActor(userId);
});

export async function getActorOrNull(): Promise<Actor | null> {
  try {
    return await getActor();
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }
}
