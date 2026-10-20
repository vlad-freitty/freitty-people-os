import { readJson, route } from "@/server/http";
import { assignPolicy } from "@/server/services/absences";

/** Body {targetType: "company" | "department" | "employee", targetId, policyId | null} */
export const PUT = route(async ({ actor, req }) => assignPolicy(actor, await readJson(req)));
