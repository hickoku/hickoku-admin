"use client";

import { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { useToast } from "@/components/Toast";
import { fmtDate } from "@/components/OrderCard";
import { Building2, Receipt, Landmark, Eye, Save, FileText, Info } from "lucide-react";
import { readJson } from "@/lib/readJson";

type Toggles = Record<string, { label: string; group: string }>;

const label = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 } as const;
const hint = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } as const;

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
        <span style={{ color: "var(--text-muted)", marginTop: 2 }}>{icon}</span>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
          {description && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Input({ title, value, onChange, placeholder, help, mono, multiline, numeric }: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  mono?: boolean;
  multiline?: boolean;
  numeric?: boolean;
}) {
  const style = { width: "100%", ...(mono ? { fontFamily: "var(--font-code)", fontSize: 13 } : {}) };
  return (
    <div>
      <label style={label}>{title}</label>
      {multiline ? (
        <textarea className="input-field" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ ...style, resize: "vertical" }} />
      ) : (
        <input
          className="input-field"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={style}
          {...(numeric ? { inputMode: "decimal" as const, type: "number", min: 0, step: "0.01" } : {})}
        />
      )}
      {help && <p style={hint}>{help}</p>}
    </div>
  );
}

function Switch({ checked, onChange, label: text, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", cursor: "pointer", fontSize: 13 }}>
      <span>{text}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="knob" />
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [meta, setMeta] = useState<{ saved: boolean; env: string; table: string; toggles: Toggles } | null>(null);
  const previewForm = useRef<HTMLFormElement>(null);
  const previewInput = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to load settings");
      setSettings(data.settings);
      setMeta({ saved: data.saved, env: data.env, table: data.table, toggles: data.toggles });
      setDirty(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const setSeller = (k: string) => (v: string) => {
    setDirty(true);
    setSettings((s: any) => ({ ...s, seller: { ...s.seller, [k]: v } }));
  };
  const setInvoice = (k: string) => (v: string) => {
    setDirty(true);
    setSettings((s: any) => ({ ...s, invoice: { ...s.invoice, [k]: v } }));
  };
  const setShow = (k: string) => (v: boolean) => {
    setDirty(true);
    setSettings((s: any) => ({ ...s, invoice: { ...s.invoice, show: { ...s.invoice.show, [k]: v } } }));
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to save");
      setSettings(data.settings);
      setMeta((m) => (m ? { ...m, saved: true } : m));
      setDirty(false);
      showToast("Store details saved. New invoices use them now.");
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  function preview() {
    if (!previewForm.current || !previewInput.current) return;
    previewInput.current.value = JSON.stringify(settings);
    previewForm.current.submit();
  }

  const groups = meta ? [...new Set(Object.values(meta.toggles).map((t) => t.group))] : [];
  const seller = settings?.seller || {};
  const inv = settings?.invoice || {};
  const autoTitle = inv.show?.gstin && seller.gstin ? "Tax Invoice" : "Invoice";

  return (
    <AdminLayout
      title="Store details"
      subtitle="Your business details and what appears on invoices"
      action={
        settings && (
          <>
            <button className="btn-ghost" onClick={preview}>
              <Eye size={15} /> Preview invoice
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || (!dirty && meta?.saved)}>
              <Save size={15} /> {saving ? "Saving…" : "Save"}
            </button>
          </>
        )
      }
    >
      {loading && <LoadingState message="Loading settings…" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {settings && meta && (
        <>
          {!meta.saved && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--accent-blue-glow)", border: "1px solid #b2ddff", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "#1849a9" }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Not saved yet. These are the values from the server&apos;s SELLER_* settings. Review them and press Save: after that,
                this page is where invoice details live.
              </span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
            <div>
              <Section icon={<Building2 size={18} />} title="Business" description="The legal entity shown as the seller on every invoice.">
                <div style={{ display: "grid", gap: 14 }}>
                  <Input title="Business name *" value={seller.name} onChange={setSeller("name")} />
                  <Input title="Address" value={seller.address} onChange={setSeller("address")} placeholder="Building, street, area" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 12 }}>
                    <Input title="City" value={seller.city} onChange={setSeller("city")} />
                    <Input title="State" value={seller.state} onChange={setSeller("state")} />
                    <Input title="PIN code" value={seller.pin} onChange={setSeller("pin")} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <Input title="Phone" value={seller.phone} onChange={setSeller("phone")} />
                    <Input title="Email" value={seller.email} onChange={setSeller("email")} />
                    <Input title="Website" value={seller.website} onChange={setSeller("website")} />
                  </div>
                </div>
              </Section>

              <Section
                icon={<Receipt size={18} />}
                title="Tax and fees"
                description="Order totals include GST. The invoice works it out like the admin order email: taxable value = total ÷ (1 + rate), GST = the rest."
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 110px", gap: 12 }}>
                    <Input title="GSTIN" value={seller.gstin} onChange={setSeller("gstin")} mono placeholder="15 characters" />
                    <Input title="PAN" value={seller.pan} onChange={setSeller("pan")} mono />
                    <Input title="State code" value={seller.stateCode} onChange={setSeller("stateCode")} mono placeholder="e.g. 27" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <Input
                      title="GST rate (%)"
                      numeric
                      placeholder="18"
                      value={String(inv.gstRate ?? "")}
                      onChange={setInvoice("gstRate")}
                      help={seller.state ? `CGST + SGST for buyers in ${seller.state}, IGST elsewhere.` : "Fill in your State above to split CGST/SGST vs IGST."}
                    />
                    <Input title="Handling fee shown as FREE (₹)" numeric placeholder="20" value={String(inv.handlingFee ?? "")} onChange={setInvoice("handlingFee")} help="Same for every order. Empty = ₹20." />
                    <Input
                      title="Fallback delivery fee (₹)"
                      numeric
                      placeholder="50"
                      value={String(inv.deliveryFee ?? "")}
                      onChange={setInvoice("deliveryFee")}
                      help="Each order's own delivery fee is used first. This is only for orders without one. Empty = ₹50."
                    />
                  </div>
                </div>
              </Section>

              <Section icon={<Landmark size={18} />} title="Bank details" description="Printed on the invoice when “Bank details” is switched on.">
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
                  <Input title="Bank name" value={seller.bank} onChange={setSeller("bank")} />
                  <Input title="Account number" value={seller.accountNo} onChange={setSeller("accountNo")} mono />
                  <Input title="IFSC" value={seller.ifsc} onChange={setSeller("ifsc")} mono />
                </div>
              </Section>

              <Section icon={<FileText size={18} />} title="Invoice text">
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                    <Input title="Title" value={inv.title} onChange={setInvoice("title")} placeholder={`Automatic (${autoTitle})`} help="Leave empty to choose automatically." />
                    <Input title="Number prefix" value={inv.prefix} onChange={setInvoice("prefix")} mono help={`e.g. ${inv.prefix || "INV"}-2026-HK123456`} />
                  </div>
                  <Input title="Terms and conditions" value={inv.terms} onChange={setInvoice("terms")} multiline />
                  <Input title="Footer note" value={inv.footerNote} onChange={setInvoice("footerNote")} />
                  <Input title="Thank-you line (thermal receipt)" value={inv.thankYouNote} onChange={setInvoice("thankYouNote")} />
                </div>
              </Section>
            </div>

            <div style={{ position: "sticky", top: 24 }}>
              <div className="card" style={{ padding: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>Show on invoice</h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2, marginBottom: 8 }}>Switched-off sections stay saved here but are left off invoices.</p>
                {groups.map((g) => (
                  <div key={g} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>{g}</div>
                    {Object.entries(meta.toggles)
                      .filter(([, t]) => t.group === g)
                      .map(([k, t]) => (
                        <Switch key={k} id={`show-${k}`} label={t.label} checked={inv.show?.[k] !== false} onChange={setShow(k)} />
                      ))}
                  </div>
                ))}
              </div>
              <p style={{ ...hint, marginTop: 10, lineHeight: 1.5 }}>
                {meta.saved && settings.updatedAt ? `Last saved ${fmtDate(settings.updatedAt)}. ` : ""}
                Saved to <span className="code">{meta.table}</span> ({meta.env}). Changes apply to every invoice you open from now on, including old orders.
              </p>
            </div>
          </div>
        </>
      )}

      <form ref={previewForm} method="POST" action="/api/invoice" target="_blank" style={{ display: "none" }}>
        <input ref={previewInput} type="hidden" name="settings" />
      </form>
      {toast}
    </AdminLayout>
  );
}
