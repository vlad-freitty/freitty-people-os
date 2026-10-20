import { readJson, route } from "@/server/http";
import { setPaymentStatus } from "@/server/services/payments";

/** Body {status: "documents_received" | "approved" | "paid", paymentRef?} */
export const PUT = route<{ id: string }>(async ({ actor, req, params }) => setPaymentStatus(actor, params.id, await readJson(req)));
