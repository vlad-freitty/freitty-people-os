import { route } from "@/server/http";
import { publishTemplate } from "@/server/services/templates";

export const POST = route<{ id: string }>(({ actor, params }) => publishTemplate(actor, params.id));
