import { route } from "@/server/http";
import { listInitiableTypes } from "@/server/services/requests";

export const GET = route(({ actor }) => listInitiableTypes(actor));
