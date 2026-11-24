"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { useToast } from "@/components/Toast";
import { fmtDate } from "@/components/OrderCard";
import { imageSrc } from "@/components/products/ImageManager";
import { ArrowLeft, Check, X, ExternalLink, Camera, ShieldCheck, Gift, MapPin, MessageCircle, Ban, Save, Package, ScrollText } from "lucide-react";

const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const label = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 } as const;
const muted = { fontSize: 13, color: "var(--text-muted)" } as const;

function Card({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: "var(--text-muted)", display: "flex" }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function CheckRow({ ok, title, text, who }: { ok: boolean | null; title: string; text: string; who: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)", alignItems: "flex-start" }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: ok === null ? "#f2f4f7" : ok ? "var(--accent-emerald-glow)" : "var(--accent-red-glow)",
          color: ok === null ? "var(--text-muted)" : ok ? "var(--accent-emerald)" : "#b42318",
          fontSize: 12,
          fontWeight: 700,
        }}
        aria-label={ok === null ? "Not checked" : ok ? "Passed" : "Failed"}
      >
        {ok === null ? "?" : ok ? <Check size={12} /> : <X size={12} />}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={muted}>{text}</div>
      </div>
      <span className="badge badge-neutral" style={{ textTransform: "none" }}>
        {who}
      </span>
    </div>
  );
}

export default function ClubApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);
  const [review, setReview] = useState({ followers: "", followsUs: false, dmReceived: false, notes: "" });
  const [reviewDirty, setReviewDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "reject" | "block">(null);
  const [reason, setReason] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/club/applications/${id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load");
      setD(data);
      const r = data.app.review || {};
      setReview({ followers: r.followers !== undefined ? String(r.followers) : "", followsUs: !!r.followsUs, dmReceived: !!r.dmReceived, notes: r.notes || "" });
      setReviewDirty(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setR = (k: keyof typeof review, v: any) => {
    setReview((p) => ({ ...p, [k]: v }));
    setReviewDirty(true);
  };

  async function saveReview(quiet = false) {
    setBusy("review");
    try {
      const res = await fetch(`/api/club/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setD((p: any) => ({ ...p, app: { ...p.app, ...data.app } }));
      setReviewDirty(false);
      if (!quiet) showToast("Review saved");
      return true;
    } catch (e: any) {
      showToast(e.message || "Couldn't save", true);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "approve" | "reject" | "block" | "unblock", extra: Record<string, any> = {}) {
    if (action === "approve" && reviewDirty && !(await saveReview(true))) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/club/applications/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      // Below the follower minimum or over the weekly cap: let the admin decide.
      if (action === "approve" && res.status === 422 && !extra.override) {
        setBusy(null);
        if (confirm(`${data.error}\n\nApprove anyway?`)) return act("approve", { override: true });
        return;
      }
      if (!data.success) throw new Error(data.error);
      showToast(
        action === "approve"
          ? `Approved. ₹0 order ${d.app.id} created, AWB ${data.awb}.`
          : action === "reject"
            ? "Application rejected"
            : action === "block"
              ? `Blocked ${data.blocked.join(", ")}`
              : "Unblocked",
      );
      setPanel(null);
      setReason("");
      await load();
    } catch (e: any) {
      showToast(e.message || "Something went wrong", true);
    } finally {
      setBusy(null);
    }
  }

  const app = d?.app;
  const pending = app && (app.status === "submitted" || app.status === "approving");
  const minF = d?.minFollowers || 0;
  const followersNum = review.followers === "" ? null : Number(review.followers);
  const wa = (text: string) => `https://wa.me/91${app?.whatsapp}?text=${encodeURIComponent(text)}`;
  const firstName = app?.address?.firstName || "";
  const handle = d?.handle || "@hickokuperfume";

  return (
    <AdminLayout
      title={app ? `${app.id} · @${app.instagram}` : "Application"}
      subtitle={app ? `Applied ${fmtDate(app.createdAt)}` : undefined}
      action={
        app && pending ? (
          <>
            <button className="btn-ghost" onClick={() => setPanel(panel === "reject" ? null : "reject")} disabled={!!busy}>
              <X size={15} /> Reject…
            </button>
            <button className="btn-primary" onClick={() => act("approve")} disabled={!!busy}>
              <Check size={15} /> {busy === "approve" ? "Creating order…" : "Approve & create order"}
            </button>
          </>
        ) : null
      }
    >
      <Link href="/club/applications" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 14 }}>
        <ArrowLeft size={14} /> All applications
      </Link>
      {loading && !d && <LoadingState message="Loading application…" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {app && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {pending ? <span className="badge badge-warning">Pending review</span> : app.status === "approved" ? <span className="badge badge-success">Approved</span> : <span className="badge badge-error">Rejected</span>}
            {app.blocked && <span className="badge badge-error">Blocked</span>}
            <span className="badge badge-neutral" style={{ textTransform: "none" }}>
              {app.forWhom === "friend" ? `Surprise for ${app.recipientName}` : "For themselves"}
            </span>
            {pending && <span className={`badge ${app.shipBy <= new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) ? "badge-error" : "badge-info"}`} style={{ textTransform: "none" }}>Ship by {day(app.shipBy)}</span>}
            {pending && (
              <span className={`badge ${d.approvedThisWeek >= d.weeklyCap ? "badge-error" : "badge-neutral"}`} style={{ textTransform: "none" }}>
                {d.approvedThisWeek} / {d.weeklyCap} approved this week
              </span>
            )}
          </div>

          {panel === "reject" && (
            <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "#fecdca" }}>
              <label style={label} htmlFor="reason">
                Why? (only you see this)
              </label>
              <input id="reason" className="input-field" style={{ width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Private account, fewer than 2,000 followers" autoFocus />
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                <button className="btn-ghost" onClick={() => setPanel(null)}>
                  Cancel
                </button>
                <button className="btn-danger" onClick={() => act("reject", { reason })} disabled={!!busy}>
                  {busy === "reject" ? "Rejecting…" : "Reject application"}
                </button>
              </div>
              <p style={{ ...muted, marginTop: 8 }}>Nothing is sent to them automatically. Use the WhatsApp buttons below to let them know.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <Card
                icon={<Camera size={18} />}
                title={`@${app.instagram}`}
                action={
                  <a className="btn-ghost" href={`https://instagram.com/${app.instagram}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", height: 30, padding: "0 10px" }}>
                    Open on Instagram <ExternalLink size={13} />
                  </a>
                }
              >
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, alignItems: "end" }}>
                  <div>
                    <label style={label} htmlFor="followers">
                      Followers
                    </label>
                    <input id="followers" className="input-field" type="number" inputMode="numeric" min={0} value={review.followers} onChange={(e) => setR("followers", e.target.value)} style={{ width: "100%" }} disabled={!pending} />
                  </div>
                  <p style={{ ...muted, paddingBottom: 8 }}>
                    {followersNum === null ? `Minimum ${minF.toLocaleString("en-IN")}.` : followersNum >= minF ? `✓ Over the ${minF.toLocaleString("en-IN")} minimum.` : `Below the ${minF.toLocaleString("en-IN")} minimum.`} Instagram doesn&apos;t share this with websites, so check the profile.
                  </p>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={review.followsUs} onChange={(e) => setR("followsUs", e.target.checked)} disabled={!pending} /> Follows {handle}
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={review.dmReceived} onChange={(e) => setR("dmReceived", e.target.checked)} disabled={!pending} /> DM with {app.id} received (optional)
                  </label>
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={label} htmlFor="notes">
                    Internal notes
                  </label>
                  <textarea id="notes" className="input-field" rows={3} value={review.notes} onChange={(e) => setR("notes", e.target.value)} style={{ width: "100%", resize: "vertical" }} placeholder="e.g. Profile looks genuine, lots of party content" />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button className="btn-ghost" onClick={() => saveReview()} disabled={!reviewDirty || !!busy}>
                    <Save size={14} /> {busy === "review" ? "Saving…" : "Save review"}
                  </button>
                </div>
              </Card>

              <Card icon={<ShieldCheck size={18} />} title="Eligibility checks">
                <CheckRow ok={d.checks.leadDays.ok} title="Applied early enough" text={d.checks.leadDays.text} who="Auto" />
                <CheckRow ok={d.checks.reapply.ok} title="One application per person a month" text={d.checks.reapply.text} who="Auto" />
                <CheckRow ok={d.checks.blocklist.ok} title="Not on the blocklist" text={d.checks.blocklist.text} who="Auto" />
                <CheckRow ok={followersNum === null ? null : followersNum >= minF} title={`${minF.toLocaleString("en-IN")}+ followers`} text={followersNum === null ? "Enter the count above" : `${followersNum.toLocaleString("en-IN")} followers entered`} who="You" />
                <CheckRow ok={review.followsUs ? true : null} title={`Follows ${handle}`} text={review.followsUs ? "Ticked" : "Tick above after checking their following list"} who="You" />
                <CheckRow ok={app.adultConfirmed ? true : false} title="18+ confirmed" text={app.adultConfirmed ? "Ticked on the form" : "Not confirmed"} who="Form" />
              </Card>

              {d.others.length > 0 && (
                <Card icon={<ScrollText size={18} />} title="Other applications from this person">
                  {d.others.map((o: any) => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                      <Link href={`/club/applications/${o.id}`}>{o.id}</Link>
                      <span style={muted}>
                        {o.occasionName} · {fmtDate(o.createdAt)} · {o.status}
                      </span>
                    </div>
                  ))}
                </Card>
              )}
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <Card icon={<Gift size={18} />} title="Occasion & gift">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {app.gift.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageSrc(app.gift.image)} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {app.gift.name} · {app.gift.size}
                    </div>
                    <div style={muted}>{app.labelName ? `Label: “${app.labelName}”` : "No name label"}</div>
                  </div>
                </div>
                <dl style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 13, marginTop: 14 }}>
                  <dt style={muted}>Occasion</dt>
                  <dd>
                    {app.occasionName} · {day(app.partyDate)}
                  </dd>
                  <dt style={muted}>For</dt>
                  <dd>{app.forWhom === "friend" ? `${app.recipientName} (surprise)` : `${app.recipientName} (themselves)`}</dd>
                  <dt style={muted}>Ship by</dt>
                  <dd>{day(app.shipBy)}</dd>
                </dl>
              </Card>

              <Card icon={<MapPin size={18} />} title="Delivery & contact">
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600 }}>{`${app.address.firstName} ${app.address.lastName}`.trim()}</div>
                  <div>{app.address.street}</div>
                  <div>
                    {app.address.city}, {app.address.state} {app.address.zipCode}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Phone {app.address.phone} · WhatsApp {app.whatsapp}
                  </div>
                  <div>{app.email}</div>
                </div>
              </Card>

              {app.status === "approved" && (
                <Card icon={<Package size={18} />} title="Order">
                  <dl style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: 13 }}>
                    <dt style={muted}>Order</dt>
                    <dd>
                      {app.id} · ₹0 · <Link href="/orders">find in Orders</Link>
                    </dd>
                    <dt style={muted}>AWB</dt>
                    <dd className="code">{app.awb}</dd>
                    <dt style={muted}>Approved</dt>
                    <dd>{fmtDate(app.approvedAt)}</dd>
                  </dl>
                </Card>
              )}
              {app.status === "rejected" && (
                <Card icon={<X size={18} />} title="Rejected">
                  <p style={{ fontSize: 13 }}>{app.rejectReason || "No reason noted."}</p>
                  <p style={{ ...muted, marginTop: 4 }}>{fmtDate(app.rejectedAt)}</p>
                </Card>
              )}

              <Card icon={<ScrollText size={18} />} title={`Terms v${app.termsVersion}`}>
                <p style={{ fontSize: 13 }}>Accepted {fmtDate(app.termsAcceptedAt)}{app.client?.ip ? ` · IP ${app.client.ip.replace(/\.\d+\.\d+$/, ".xx.xx")}` : ""}</p>
              </Card>

              <Card icon={<MessageCircle size={18} />} title="WhatsApp">
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    app.status === "approved" && [
                      "Send “You're approved”",
                      `Hi ${firstName}! 🎉 Your Hickoku Club application ${app.id} is approved. Your ${app.gift.name} is on its way (tracking: ${app.awb}). On the day, film the unwrap and post it as a Reel within ${d.postWithinHours} hours, tagging ${handle}. Can't wait to see it!`,
                    ],
                    pending && !review.followsUs && ["Ask them to follow us", `Hi ${firstName}! Thanks for applying to Hickoku Club (${app.id}). Please follow ${handle} on Instagram so we can approve your gift.`],
                    pending && !review.dmReceived && ["Ask for the DM code", `Hi ${firstName}! To confirm it's really you, please DM "${app.id}" to ${handle} from @${app.instagram}.`],
                    app.status === "rejected" && ["Send “Not this time”", `Hi ${firstName}, thanks for applying to Hickoku Club (${app.id}). We can't send a gift this time, but we'd love to see you apply again for your next occasion.`],
                  ]
                    .filter(Boolean)
                    .map((m: any) => (
                      <a key={m[0]} className="btn-ghost" href={wa(m[1])} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", justifyContent: "flex-start" }}>
                        <MessageCircle size={14} /> {m[0]}
                      </a>
                    ))}
                </div>
                <p style={{ ...muted, marginTop: 8 }}>Opens WhatsApp with the message ready. You press send.</p>
              </Card>

              <Card icon={<Ban size={18} />} title={app.blocked ? "Blocked" : "Block this person"}>
                {app.blocked ? (
                  <>
                    <p style={{ fontSize: 13 }}>@{app.instagram} and their phone numbers can&apos;t apply again.</p>
                    <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => confirm(`Unblock @${app.instagram}?`) && act("unblock")} disabled={!!busy}>
                      Unblock
                    </button>
                  </>
                ) : panel === "block" ? (
                  <>
                    <label style={label} htmlFor="block-reason">
                      Reason
                    </label>
                    <input id="block-reason" className="input-field" style={{ width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fake followers, spam" autoFocus />
                    <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                      <button className="btn-ghost" onClick={() => setPanel(null)}>
                        Cancel
                      </button>
                      <button className="btn-danger" onClick={() => act("block", { reason })} disabled={!!busy}>
                        {busy === "block" ? "Blocking…" : "Block"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={muted}>Blocks @{app.instagram} and both phone numbers from future applications{pending ? ", and rejects this one" : ""}.</p>
                    <button className="btn-ghost" style={{ marginTop: 10, color: "#b42318" }} onClick={() => setPanel("block")}>
                      <Ban size={14} /> Block user
                    </button>
                  </>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
      {toast}
    </AdminLayout>
  );
}
