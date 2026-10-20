import { route } from "@/server/http";
import { listUsers } from "@/server/services/roles";

export const GET = route(({ actor }) => listUsers(actor));
