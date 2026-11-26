"use client";

import { useCallback, useEffect, useState } from "react";
import { Truck, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/FormBits";
import ConfirmDialog from "@/components/ConfirmDialog";
import { fmtDate } from "@/components/OrderCard";
import { readJson } from "@/lib/readJson";

type Key = "shipping" | "delhivery" | "geolocation";
type Meta = Record<Key, { label: string; help: string; envName: string | null }>;
type Switches = Partial<Record<Key, boolean>> & { updatedAt?: string };

const ORDER: Key[] = ["shipping", "delhivery", "geolocation"];

// What the change means for customers, shown in the confirm step on Live.
const effect: Record<Key, (on: boolean) => string> = {
  shipping: (on) =>
    on
      ? "Customers will PAY the delivery fee (Delhivery rate for their PIN code, else ₹50). It is added to the checkout total, the Razorpay amount, emails and invoices."
      : "Delivery becomes FREE again: the fee is shown struck out and not charged.",
  delhivery: (on) =>
    on
      ? "PIN codes are checked with Delhivery, the delivery rate comes from Delhivery, and every paid order is booked as a Delhivery shipment automatically."
      : "No Delhivery calls from the website: no PIN code check, ₹50 delivery fee, and shipments are not booked automatically.",
  geolocation: (on) => (on ? "Customers see a “Use Current Location” button on the address form." : "The “Use Current Location” button is hidden."),
};

// Checkout switches: shipping charge, Delhivery, location button. Saved one at a time.
export default function CheckoutSwitchesCard({ isProd, onToast }: { isProd: boolean; onToast: (msg: string, error?: boolean) => void }) {
  const [switches, setSwitches] = useState<Switches | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ key: Key; value: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/checkout", { cache: "no-store" });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error);
      return data;
    } catch (e) {
      throw new Error((e as Error).message || "Failed to load checkout switches");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .then((d) => {
        if (!alive) return;
        setSwitches(d.switches);
        setMeta(d.meta);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [load]);

  const save = async (key: Key, value: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error);
      setSwitches(data.switches);
      onToast(`${meta?.[key].label} turned ${value ? "on" : "off"}. The website follows within 30 seconds.`);
    } catch (e) {
      onToast((e as Error).message || "Failed to save", true);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const change = (key: Key, value: boolean) => (isProd ? setPending({ key, value }) : save(key, value));

  return (
    <div className="card" style={{ padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <span style={{ color: "var(--text-muted)", marginTop: 2 }}>
          <Truck size={18} />
        </span>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Checkout switches</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Saved as soon as you flip one. The {isProd ? "live" : "stage"} website follows within 30 seconds.
          </p>
        </div>
      </div>

      {isProd && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", background: "#fffaeb", border: "1px solid #fedf89", borderRadius: 8, marginBottom: 12, fontSize: 12.5, color: "#93370d" }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>These change the LIVE checkout and what customers pay. Try each change on stage first.</span>
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: "#b42318" }}>{error}</p>}
      {!switches && !error && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>}

      {switches && meta && (
        <div>
          {ORDER.map((k, i) => {
            const set = typeof switches[k] === "boolean";
            const on = switches[k] === true;
            return (
              <div key={k} style={{ display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0", borderTop: i ? "1px solid var(--border)" : undefined }}>
                <label htmlFor={`co-${k}`} style={{ cursor: "pointer" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                    {meta[k].label}{" "}
                    <span className={`badge ${on ? "badge-success" : set || !meta[k].envName ? "badge-neutral" : "badge-warning"}`} style={{ marginLeft: 6 }}>
                      {set ? (on ? "On" : "Off") : meta[k].envName ? "Not set" : "Off"}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, maxWidth: 520 }}>{meta[k].help}</p>
                  {!set && meta[k].envName && (
                    <p style={{ fontSize: 12, color: "#b54708", marginTop: 3 }}>
                      Not set here yet: the website is using {meta[k].envName} from its own settings. Flip the switch to control it from here.
                    </p>
                  )}
                </label>
                <Switch id={`co-${k}`} checked={on} disabled={busy} onChange={(v) => change(k, v)} />
              </div>
            );
          })}
          {switches.updatedAt && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Last changed {fmtDate(switches.updatedAt)}</p>}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title={pending ? `Turn ${meta?.[pending.key].label} ${pending.value ? "ON" : "OFF"} on the live website?` : ""}
        confirmLabel={pending?.value ? "Turn on" : "Turn off"}
        busyLabel="Saving…"
        tone={pending?.key === "shipping" && pending.value ? "danger" : "primary"}
        busy={busy}
        onConfirm={() => pending && save(pending.key, pending.value)}
        onClose={() => !busy && setPending(null)}
      >
        {pending && <p style={{ fontSize: 13.5 }}>{effect[pending.key](pending.value)}</p>}
      </ConfirmDialog>
    </div>
  );
}
