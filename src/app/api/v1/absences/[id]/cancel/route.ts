import { route } from "@/server/http";
import { cancelAbsence } from "@/server/services/absences";

export const POST = route<{ id: string }>(({ actor, params }) => cancelAbsence(actor, params.id));
