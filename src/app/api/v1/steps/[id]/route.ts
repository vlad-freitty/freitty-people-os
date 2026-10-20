import { readJson, route } from "@/server/http";
import { actOnStep } from "@/server/requests/engine";

/** Body: {action: "approve" | "reject" | "checklist" | "complete" | "fill" | "start_child", ...} */
export const POST = route<{ id: string }>(async ({ actor, req, params }) => actOnStep(actor, params.id, await readJson(req)));
