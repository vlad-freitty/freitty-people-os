import { getActor } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { toCsv, toXlsx } from "@/server/money/export";
import { exportRows } from "@/server/services/payments";

/** ?format=csv|xlsx — finance export (PRD 7). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const { name, header, rows } = await exportRows(actor, (await params).id);
    const xlsx = new URL(req.url).searchParams.get("format") === "xlsx";
    const body = xlsx ? new Uint8Array(await toXlsx("payments", header, rows)) : toCsv(header, rows);
    return new Response(body, {
      headers: {
        "content-type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.${xlsx ? "xlsx" : "csv"}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
