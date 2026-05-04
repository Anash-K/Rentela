import crypto from "crypto";

export function razorpayExternalEventId(body) {
  if (body?.id != null && String(body.id).length > 0) {
    return String(body.id);
  }
  const pid = body?.payload?.payment?.entity?.id || "";
  const created = body?.created_at ?? "";
  const ev = body?.event ?? "";
  return crypto.createHash("sha256").update(`${ev}|${created}|${pid}`).digest("hex");
}
