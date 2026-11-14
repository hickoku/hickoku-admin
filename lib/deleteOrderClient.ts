// Client helper for deleting one or many orders through the bulk endpoint.
// The confirmation is shown by the caller (ConfirmDialog) before this runs.
export type DeleteResult = { deleted: string[]; failed: { id: string; error: string }[] };

export async function deleteOrders(ids: string[]): Promise<DeleteResult> {
  const res = await fetch("/api/orders", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!data.success && !data.deleted) throw new Error(data.error || "Failed to delete orders");
  return { deleted: data.deleted || [], failed: data.failed || [] };
}

// Facts the confirmation dialog warns about before deleting.
export function deleteWarnings(orders: any[]) {
  const storefront = orders.filter((o) => !o.manuallyCreated).length;
  const activeShipments = orders.filter((o) => o.awb && !["cancelled", "delivered"].includes(o.status)).length;
  return { storefront, activeShipments };
}
