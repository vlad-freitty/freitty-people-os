import { route } from "@/server/http";
import { cancelRequest } from "@/server/requests/engine";

export const POST = route<{ id: string }>(({ actor, params }) => cancelRequest(actor, params.id));
