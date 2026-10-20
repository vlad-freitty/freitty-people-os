import { route } from "@/server/http";
import { lockPeriod } from "@/server/services/payments";

export const POST = route<{ id: string }>(({ actor, params }) => lockPeriod(actor, params.id));
