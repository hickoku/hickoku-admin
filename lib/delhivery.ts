import { envFor, requireEnvFor, IS_PROD } from "@/lib/env";

// Stage uses Delhivery's staging server, so test orders never book real
// pickups. Token: DELHIVERY_API_TOKEN_STAGE/_PROD, URL: DELHIVERY_BASE_URL_STAGE/_PROD.
export function delhiveryBase() {
  return envFor("DELHIVERY_BASE_URL") || (IS_PROD ? "https://track.delhivery.com" : requireEnvFor("DELHIVERY_BASE_URL"));
}
export function delhiveryToken() {
  return requireEnvFor("DELHIVERY_API_TOKEN");
}

export async function delhiveryFetch(path: string) {
  const token = delhiveryToken();
  const res = await fetch(`${delhiveryBase()}${path}`, {
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Delhivery API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// Cancels a shipment. Confirmed working against the live API (verified
// 2026-08-15 with a real waybill): POST /api/p/edit, JSON body, returns
// { status: true, remark: "Shipment has been cancelled." } on success.
// Only works while the shipment is Manifested / In Transit / Pending / Open
// / Scheduled — Delhivery rejects it once a package has been delivered or
// is otherwise past a cancellable state.
export async function cancelShipment(waybill: string): Promise<{ success: boolean; message: string }> {
  const token = delhiveryToken();

  const res = await fetch(`${delhiveryBase()}/api/p/edit`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ waybill, cancellation: "true" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== true) {
    return { success: false, message: data.remark || data.error || `Delhivery cancellation failed (${res.status})` };
  }
  return { success: true, message: data.remark || "Shipment cancelled" };
}

export function mapShipment(item: any) {
  const s = item.Shipment;
  return {
    waybill: s.AWB,
    referenceNo: s.ReferenceNo,
    status: s.Status?.Status,
    statusDescription: s.Status?.Instructions,
    location: s.Status?.City,
    expectedDelivery: s.ExpectedDeliveryDate,
    origin: s.Origin,
    destination: s.Destination,
    consigneeName:
      typeof s.Consignee === "object" ? s.Consignee?.Name || s.Consignee?.name || "—" : s.Consignee || "—",
    consigneePhone: s.ConsigneeAdd?.Telephone1 || s.ConsigneeAdd?.Telephone2 || s.ConsigneeAdd?.Phone || "—",
    weight: s.Weight,
    cod: s.CODAmount,
    scans: s.Scans?.map((scan: any) => ({
      date: scan.ScanDetail?.ScanDateTime,
      status: scan.ScanDetail?.Scan,
      location: scan.ScanDetail?.ScannedLocation,
      instructions: scan.ScanDetail?.Instructions,
    })),
  };
}
