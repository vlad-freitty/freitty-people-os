import { route } from "@/server/http";
import { constructorOptions } from "@/server/services/templates";

export const GET = route(({ actor }) => constructorOptions(actor));
