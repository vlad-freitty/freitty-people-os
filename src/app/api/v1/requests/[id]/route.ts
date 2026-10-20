import { route } from "@/server/http";
import { getRequest } from "@/server/services/requests";

export const GET = route<{ id: string }>(({ actor, params }) => getRequest(actor, params.id));
