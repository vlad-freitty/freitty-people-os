import { route } from "@/server/http";
import { resetPassword } from "@/server/services/users";

export const POST = route<{ id: string }>(({ actor, params }) => resetPassword(actor, params.id));
