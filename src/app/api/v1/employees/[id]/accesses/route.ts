import { route } from "@/server/http";
import { listGrants } from "@/server/services/systems";

export const GET = route<{ id: string }>(({ actor, params }) => listGrants(actor, params.id));
