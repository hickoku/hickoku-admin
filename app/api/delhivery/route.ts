import { NextResponse } from "next/server";
import { delhiveryFetch, mapShipment } from "@/lib/delhivery";

// Delhivery's tracking endpoint (/api/v1/packages/json/) does NOT support an
// unfiltered "list everything" call — it requires waybill(s) or reference
// number(s) you already know. There is no way to enumerate all shipments on
// an account, so every call here must be scoped to specific waybills/refs
// (which the Orders page collects from each order's stored `awb` field).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const waybill = searchParams.get("waybill"); // single waybill -> { shipment }
  const waybills = searchParams.get("waybills"); // comma-separated -> { shipments }
  const refNum = searchParams.get("ref"); // single/comma-separated reference number(s)

  try {
    if (waybills) {
      const data = await delhiveryFetch(`/api/v1/packages/json/?waybill=${encodeURIComponent(waybills)}`);
      const shipments = (data.ShipmentData || []).map(mapShipment);
      return NextResponse.json({ success: true, shipments });
    }

    if (waybill) {
      const data = await delhiveryFetch(`/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}`);
      const shipment = data.ShipmentData?.[0];
      if (!shipment) {
        return NextResponse.json({ success: false, error: "Shipment not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, shipment: mapShipment(shipment) });
    }

    if (refNum) {
      // Delhivery expects the param named `ref_ids` (not `ref_nums`) for reference-number lookups.
      const data = await delhiveryFetch(`/api/v1/packages/json/?ref_ids=${encodeURIComponent(refNum)}`);
      return NextResponse.json({
        success: true,
        shipments: (data.ShipmentData || []).map(mapShipment),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Delhivery's tracking API requires a waybill, waybills, or ref parameter — it cannot list all shipments unfiltered.",
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Delhivery error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch Delhivery data" },
      { status: 500 },
    );
  }
}
