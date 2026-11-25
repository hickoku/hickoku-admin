"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState } from "@/components/States";
import { useToast } from "@/components/Toast";
import { fmtDate } from "@/components/OrderCard";
import { imageSrc } from "@/components/products/ImageManager";
import { PartyPopper, UserCheck, CalendarHeart, ScrollText, Gift, Camera, Sparkles, Save, Undo2, ArrowUp, ArrowDown, Trash2, Plus, Check, Info, X } from "lucide-react";
import { readJson } from "@/lib/readJson";

type Product = { id: string; name: string; image: string | null };
type Terms = { version: number; body: string; publishedAt: string } | null;

const label = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 } as const;
const hint = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } as const;

// Starting text for the first version of the terms. {handle} etc. are filled in from the
// rules below when the admin presses "Use starter text".
const STARTER_TERMS = (s: any) => `Hickoku Club terms

1. The gift is free. Hickoku pays for the perfume and the delivery.
2. Follow ${s.posting.instagramHandle} on Instagram before the occasion.
3. Within ${s.posting.postWithinHours} hours of the occasion, post a Reel of the gift on Instagram, tagging ${s.posting.instagramHandle} and using ${s.posting.hashtags.join(" ")}. The caption is your choice.${s.posting.storyScreenshotRequired ? "\n4. Also share it as a Story and send us a screenshot (Stories disappear after 24 hours)." : ""}
${s.posting.storyScreenshotRequired ? "5" : "4"}. Keep the Reel on your profile for at least ${s.posting.keepUpDays} days.
${s.posting.storyScreenshotRequired ? "6" : "5"}. Apply at least ${s.eligibility.leadDaysMin} days and at most ${s.eligibility.leadDaysMax} days before the occasion. One application per Instagram account every ${s.eligibility.reapplyDays} days.
${s.posting.storyScreenshotRequired ? "7" : "6"}. You must be 18 or older. Accounts need at least ${Number(s.eligibility.minFollowers).toLocaleString("en-IN")} followers; we check this during review.
${s.posting.storyScreenshotRequired ? "8" : "7"}. Every application is reviewed. We may say no without giving a reason, and the number of gifts each week is limited.
${s.posting.storyScreenshotRequired ? "9" : "8"}. If the Reel is not posted, we may stop you applying again.
${s.posting.storyScreenshotRequired ? "10" : "9"}. We may share your Reel on Hickoku's website and Instagram, with credit to you.`;

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
        <span style={{ color: "var(--text-muted)", marginTop: 2 }}>{icon}</span>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
          {description && <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{description}</p>}
        </div>
      </div>
      <div style={{ display: "grid", gap: 14 }}>{children}</div>
    </div>
  );
}

// A number with its unit after it ("24  hours of the occasion").
function Num({ id, title, value, onChange, unit, help }: { id: string; title: string; value: any; onChange: (v: string) => void; unit?: string; help?: string }) {
  return (
    <div>
      <label htmlFor={id} style={label}>
        {title}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input id={id} className="input-field" type="number" inputMode="numeric" min={0} step={1} value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ width: 110 }} />
        {unit && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{unit}</span>}
      </div>
      {help && <p style={hint}>{help}</p>}
    </div>
  );
}

function Switch({ checked, onChange, label: text, help, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; id: string }) {
  return (
    <label htmlFor={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", fontSize: 13 }}>
      <span>
        <span style={{ fontWeight: 500 }}>{text}</span>
        {help && <span style={{ ...hint, display: "block", marginTop: 2 }}>{help}</span>}
      </span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="knob" />
      </span>
    </label>
  );
}

const iconBtn = { padding: 6, minWidth: 0, height: 30 } as const;

export default function ClubSettingsPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState<any>(null); // last saved copy, for Discard
  const [s, setS] = useState<any>(null);
  const [meta, setMeta] = useState<{ saved: boolean; env: string; table: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [terms, setTerms] = useState<Terms>(null);
  const [draft, setDraft] = useState("");
  const [newOccasion, setNewOccasion] = useState("");
  const [newTag, setNewTag] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({}); // product photos that failed to load

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/club/settings");
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to load Club settings");
      setS(data.settings);
      setSaved(data.settings);
      setMeta({ saved: data.saved, env: data.env, table: data.table });
      setProducts(data.products);
      setTerms(data.terms);
      setDraft(data.terms?.body || "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const dirty = !!s && JSON.stringify(s) !== JSON.stringify(saved);
  const termsDirty = draft.trim() !== (terms?.body || "").trim();

  // Warn before leaving with unsaved rules or terms.
  useEffect(() => {
    if (!dirty && !termsDirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty, termsDirty]);

  const set = (group: string, key: string) => (v: any) => setS((p: any) => ({ ...p, [group]: { ...p[group], [key]: v } }));
  const setOccasions = (fn: (list: any[]) => any[]) => setS((p: any) => ({ ...p, occasions: fn(p.occasions) }));

  function moveOccasion(i: number, by: number) {
    setOccasions((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addOccasion() {
    const name = newOccasion.trim();
    if (!name) return;
    if (s.occasions.some((o: any) => o.name.toLowerCase() === name.toLowerCase())) {
      showToast(`"${name}" is already in the list`, true);
      return;
    }
    setOccasions((list) => [...list, { id: "", name, enabled: true }]);
    setNewOccasion("");
  }

  function addTag() {
    const tag = newTag.trim().replace(/^#*/, "");
    if (!tag) return;
    if (!/^[\p{L}\p{N}_]+$/u.test(tag)) {
      showToast("Hashtags can only have letters, numbers and _", true);
      return;
    }
    const t = `#${tag}`;
    if (!s.posting.hashtags.includes(t)) set("posting", "hashtags")([...s.posting.hashtags, t]);
    setNewTag("");
  }

  function toggleProduct(id: string) {
    const list: string[] = s.gift.productIds;
    set("gift", "productIds")(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/club/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to save");
      setS(data.settings);
      setSaved(data.settings);
      setMeta((m) => (m ? { ...m, saved: true } : m));
      showToast("Club settings saved. They apply to new applications.");
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const next = (terms?.version || 0) + 1;
    if (!confirm(`Publish these terms as v${next}? New applicants will accept v${next}. Applications already made keep the version they accepted.`)) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/club/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }) });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to publish");
      setTerms(data.terms);
      setDraft(data.terms.body);
      // Only the terms version changed on the server; keep any unsaved rule edits.
      setS((p: any) => ({ ...p, termsVersion: data.terms.version }));
      setSaved((p: any) => ({ ...p, termsVersion: data.terms.version, updatedAt: data.settings.updatedAt }));
      setMeta((m) => (m ? { ...m, saved: true } : m));
      showToast(`Terms v${data.terms.version} published.`);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setPublishing(false);
    }
  }

  const nextVersion = (terms?.version || 0) + 1;

  return (
    <AdminLayout
      title="Club settings"
      subtitle="Rules for Hickoku Club. Changes apply to new applications."
      action={
        s && (
          <>
            {dirty && <span className="badge badge-warning" style={{ alignSelf: "center" }}>Unsaved changes</span>}
            <button className="btn-ghost" onClick={() => setS(saved)} disabled={!dirty || saving}>
              <Undo2 size={15} /> Discard
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || (!dirty && meta?.saved)}>
              <Save size={15} /> {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        )
      }
    >
      {loading && <LoadingState message="Loading Club settings…" />}
      {error && <ErrorState message={error} onRetry={load} />}

      {s && meta && (
        <>
          {!meta.saved && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--accent-blue-glow)", border: "1px solid #b2ddff", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "#1849a9" }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Not saved yet. These are the suggested rules. Applications stay closed until you pick the gift perfumes, publish the terms and turn on “Accept new applications”.</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <Section icon={<PartyPopper size={18} />} title="Programme" description="Open or pause the Club for everyone.">
                <Switch id="open" label="Accept new applications" help="When off, the apply button shows “Back soon”." checked={s.programme.open} onChange={set("programme", "open")} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Num id="cap" title="Gifts per week (cap)" unit="gifts" value={s.programme.weeklyCap} onChange={set("programme", "weeklyCap")} help="Stops new approvals once reached." />
                  <Num id="featureDays" title="Feature on the wall for" unit="days" value={s.programme.featureDays} onChange={set("programme", "featureDays")} />
                </div>
              </Section>

              <Section icon={<UserCheck size={18} />} title="Who can apply" description="Checked on the form and by reviewers.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Num id="minFollowers" title="Minimum followers" value={s.eligibility.minFollowers} onChange={set("eligibility", "minFollowers")} help="Shown on the form. You check it during review." />
                  <Num id="leadMin" title="Apply at least" unit="days before" value={s.eligibility.leadDaysMin} onChange={set("eligibility", "leadDaysMin")} help="Earlier dates are greyed out on the form." />
                  <Num id="leadMax" title="Apply at most" unit="days before" value={s.eligibility.leadDaysMax} onChange={set("eligibility", "leadDaysMax")} />
                  <Num id="reapply" title="One application per handle every" unit="days" value={s.eligibility.reapplyDays} onChange={set("eligibility", "reapplyDays")} />
                </div>
                <Switch id="adults" label="Must be 18+" checked={s.eligibility.adultsOnly} onChange={set("eligibility", "adultsOnly")} />
              </Section>

              <Section icon={<CalendarHeart size={18} />} title="Occasions" description="The list on the form, in this order. Turned-off occasions are hidden from new applicants.">
                <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
                  {s.occasions.map((o: any, i: number) => (
                    <li key={`${o.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 12px", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <input
                        className="input-field"
                        aria-label={`Occasion ${i + 1} name`}
                        value={o.name}
                        maxLength={40}
                        onChange={(e) => setOccasions((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        style={{ flex: 1, height: 32, border: 0, padding: 0, background: "transparent", opacity: o.enabled ? 1 : 0.5 }}
                      />
                      <button type="button" className="btn-ghost" style={iconBtn} aria-label={`Move ${o.name} up`} disabled={i === 0} onClick={() => moveOccasion(i, -1)}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" className="btn-ghost" style={iconBtn} aria-label={`Move ${o.name} down`} disabled={i === s.occasions.length - 1} onClick={() => moveOccasion(i, 1)}>
                        <ArrowDown size={14} />
                      </button>
                      <span className={`switch ${o.enabled ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Show ${o.name} on the form`}
                          checked={o.enabled}
                          onChange={(e) => setOccasions((list) => list.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                        />
                        <span className="knob" />
                      </span>
                      {/* Only occasions added since the last save can be removed; saved ones are turned off instead,
                          so applications that used them still make sense. */}
                      {!saved?.occasions?.some((x: any) => x.id && x.id === o.id) && (
                        <button type="button" className="btn-ghost" style={iconBtn} aria-label={`Remove ${o.name}`} onClick={() => setOccasions((list) => list.filter((_, j) => j !== i))}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <form
                  style={{ display: "flex", gap: 8 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    addOccasion();
                  }}
                >
                  <input className="input-field" aria-label="New occasion" placeholder="New occasion, e.g. Baby shower" value={newOccasion} maxLength={40} onChange={(e) => setNewOccasion(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit" className="btn-ghost" disabled={!newOccasion.trim()}>
                    <Plus size={15} /> Add
                  </button>
                </form>
              </Section>

              <Section icon={<ScrollText size={18} />} title="Terms & conditions" description="Shown on the form. Applicants must accept them to apply.">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {terms ? (
                    <span className="badge badge-success" style={{ textTransform: "none" }}>v{terms.version} live · {fmtDate(terms.publishedAt)}</span>
                  ) : (
                    <span className="badge badge-warning">Not published yet</span>
                  )}
                  {termsDirty && <span className="badge badge-warning">Edited, not published</span>}
                  {!draft.trim() && (
                    <button type="button" className="btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setDraft(STARTER_TERMS(s))}>
                      Use starter text
                    </button>
                  )}
                </div>
                <textarea
                  className="input-field"
                  aria-label="Terms and conditions"
                  rows={14}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write the Club terms here, one rule per line."
                  style={{ width: "100%", resize: "vertical", lineHeight: 1.6 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ ...hint, marginTop: 0, flex: "1 1 240px" }}>
                    Publishing makes v{nextVersion}. New applicants accept v{nextVersion}; existing applications keep the version they accepted.
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn-ghost" disabled={!draft.trim()} onClick={() => setPreviewOpen(true)}>
                      Preview
                    </button>
                    <button type="button" className="btn-primary" disabled={publishing || !termsDirty || !draft.trim()} onClick={publish}>
                      {publishing ? "Publishing…" : `Publish as v${nextVersion}`}
                    </button>
                  </div>
                </div>
              </Section>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <Section icon={<Gift size={18} />} title="Gift perfumes" description="Perfumes people can pick as their free gift.">
                {products.length === 0 ? (
                  <p style={hint}>No products found.</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                    {products.map((p) => {
                      const on = s.gift.productIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{ position: "relative", display: "grid", gap: 8, padding: 10, borderRadius: 10, cursor: "pointer", border: on ? "2px solid var(--text-primary)" : "1px solid var(--border)" }}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggleProduct(p.id)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} aria-label={p.name} />
                          <span style={{ display: "block", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "var(--bg-hover)", opacity: on ? 1 : 0.5 }}>
                            {p.image && !broken[p.id] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={imageSrc(p.image)} alt="" onError={() => setBroken((b) => ({ ...b, [p.id]: true }))} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            ) : (
                              <span style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                                <Gift size={22} />
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                          {on && (
                            <span style={{ position: "absolute", top: 14, right: 14, width: 20, height: 20, borderRadius: 5, background: "var(--text-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Check size={13} />
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                <p style={{ ...hint, marginTop: 0 }}>{s.gift.productIds.length} selected</p>
                <Switch id="nameLabel" label="Personalised name label" help="The applicant types a name to print on the label." checked={s.gift.nameLabel} onChange={set("gift", "nameLabel")} />
                {s.gift.nameLabel && <Num id="nameMax" title="Name on label, at most" unit="letters" value={s.gift.nameMaxLength} onChange={set("gift", "nameMaxLength")} />}
              </Section>

              <Section icon={<Camera size={18} />} title="Posting rules" description="Shown on the form, the status page and in the terms.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label htmlFor="handle" style={label}>
                      Instagram handle to tag
                    </label>
                    <input id="handle" className="input-field" value={s.posting.instagramHandle} onChange={(e) => set("posting", "instagramHandle")(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <Num id="within" title="Post within" unit="hours of the occasion" value={s.posting.postWithinHours} onChange={set("posting", "postWithinHours")} />
                  <Num id="keepUp" title="Reel must stay up" unit="days" value={s.posting.keepUpDays} onChange={set("posting", "keepUpDays")} />
                  <Num id="notPosted" title="Mark “did not post” after" unit="days" value={s.posting.markNotPostedAfterDays} onChange={set("posting", "markNotPostedAfterDays")} help="Counted from the occasion." />
                </div>
                <div>
                  <label htmlFor="newTag" style={label}>
                    Required hashtags
                  </label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px" }}>
                    {s.posting.hashtags.map((t: string) => (
                      <span key={t} className="badge" style={{ textTransform: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {t}
                        <button
                          type="button"
                          aria-label={`Remove ${t}`}
                          onClick={() => set("posting", "hashtags")(s.posting.hashtags.filter((x: string) => x !== t))}
                          style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      id="newTag"
                      value={newTag}
                      placeholder="Add hashtag"
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "," || e.key === " ") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      onBlur={addTag}
                      style={{ border: 0, outline: "none", font: "inherit", fontSize: 13, flex: 1, minWidth: 100, background: "transparent" }}
                    />
                  </div>
                </div>
                <Switch id="story" label="Story screenshot required" help="Stories vanish in 24 hours, so we ask for a screenshot." checked={s.posting.storyScreenshotRequired} onChange={set("posting", "storyScreenshotRequired")} />
                <Switch id="autoBlock" label="Block automatically when they don't post" checked={s.posting.autoBlockNoPost} onChange={set("posting", "autoBlockNoPost")} />
              </Section>

              <Section icon={<Sparkles size={18} />} title="Featuring" description="What happens after a Reel is approved.">
                <Switch id="approval" label="Feature only after admin approval" help="Nothing goes live on its own." checked={s.featuring.requireApproval} onChange={set("featuring", "requireApproval")} />
                <Switch id="wall" label="Show on homepage wall" help={`Latest ${s.featuring.wallSize || 10} featured people.`} checked={s.featuring.homepageWall} onChange={set("featuring", "homepageWall")} />
                {s.featuring.homepageWall && <Num id="wallSize" title="Homepage wall shows" unit="people" value={s.featuring.wallSize} onChange={set("featuring", "wallSize")} />}
                <Switch id="share" label="Create share images (Story + WhatsApp Status)" checked={s.featuring.shareImages} onChange={set("featuring", "shareImages")} />
              </Section>

              <p style={{ ...hint, marginTop: 0, lineHeight: 1.5 }}>
                {meta.saved && saved?.updatedAt ? `Last saved ${fmtDate(saved.updatedAt)}. ` : ""}
                Saved to <span className="code">{meta.table}</span> ({meta.env}).
              </p>
            </div>
          </div>
        </>
      )}

      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Terms preview"
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setPreviewOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "100%", maxHeight: "80vh", overflow: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>As applicants will see it</h2>
              <button type="button" className="btn-ghost" style={iconBtn} aria-label="Close preview" autoFocus onClick={() => setPreviewOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{draft}</div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, fontSize: 13 }}>
              <input type="checkbox" disabled /> I have read and accept the Hickoku Club terms (v{termsDirty ? nextVersion : terms?.version || nextVersion})
            </label>
          </div>
        </div>
      )}
      {toast}
    </AdminLayout>
  );
}
