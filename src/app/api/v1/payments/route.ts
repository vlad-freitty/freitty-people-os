import { route, searchParams } from "@/server/http";
import { listPayments } from "@/server/services/payments";

/** ?periodId&employeeId&filter=waiting_documents|waiting_approval|unpaid&days=N */
export const GET = route(({ actor, req }) => listPayments(actor, searchParams(req)));
