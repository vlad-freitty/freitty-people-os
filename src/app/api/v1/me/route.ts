import { route } from "@/server/http";
import { getMe } from "@/server/services/me";

export const GET = route(({ actor }) => getMe(actor));
