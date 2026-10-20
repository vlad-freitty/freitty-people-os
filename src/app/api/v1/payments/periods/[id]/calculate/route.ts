import { route } from "@/server/http";
import { calculatePeriod } from "@/server/services/payments";

export const POST = route<{ id: string }>(({ actor, params }) => calculatePeriod(actor, params.id));
