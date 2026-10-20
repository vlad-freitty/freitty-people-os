import { route } from "@/server/http";
import { listMyTasks } from "@/server/services/requests";

export const GET = route(({ actor }) => listMyTasks(actor));
