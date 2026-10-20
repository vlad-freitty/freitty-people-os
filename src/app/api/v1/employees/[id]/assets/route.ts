import { route } from "@/server/http";
import { listEmployeeAssets } from "@/server/services/assets";

export const GET = route<{ id: string }>(({ actor, params }) => listEmployeeAssets(actor, params.id));
