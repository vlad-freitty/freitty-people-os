import { route } from "@/server/http";
import { getOrgStructure } from "@/server/services/org";

export const GET = route(({ actor }) => getOrgStructure(actor));
