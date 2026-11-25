"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { useToast } from "@/components/Toast";
import { fmtDate } from "@/components/OrderCard";
import { RefreshCw, ExternalLink, Image as ImageIcon, MessageCircle, Sparkles, Check, X, EyeOff, Eye, Ban } from "lucide-react";
import { readJson } from "@/lib/readJson";

type Post = {
  id: string;
  instagram: string;
  whatsapp: string;
  recipientName: string;
  forWhom: "friend" | "self";
  occasionName: string;
  partyDate: string;
  gift: { name: string };
  address: { firstName: string; lastName: string };
  blocked?: boolean;
  post?: { state: string; reelUrl?: string; postedFrom?: string; storyShot?: boolean; featureConsent?: boolean; submittedAt?: string; fixNote?: string; reviewedAt?: string };
  featured?: { at: string; until: string; hidden?: boolean };
  postStage: "waiting" | "due" | "proof" | "fix" | "verified" | "featured" | "not_posted";
  daysLate: number;
  overdue: boolean;
};
type Rules = { handle: string; hashtags: string[]; postWithinHours: number; notPostedAfterDays: number; autoBlock: boolean; featureDays: number };

const SECTIONS: { key: Post["postStage"] | "posted"; title: string; note: string }[] = [
  { key: "proof", title: "Proof sent", note: "Check the Reel and Story, then approve or ask them to fix it." },
  { key: "due", title: "Due to post", note: "The party has happened. No proof yet." },
  { key: "fix", title: "Asked to fix", note: "Waiting for them to send it again." },
  { key: "featured", title: "Featured", note: "On the wall until the date shown." },
  { key: "posted", title: "Approved, not featured", note: "Proof is good. Not on the wall (or taken off)." },
  { key: "waiting", title: "Before the party", note: "Approved gifts whose occasion is still to come." },
  { key: "not_posted", title: "Did not post", note: "" },
];

const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default function ClubPostsPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixFor, setFixFor] = useState<string | null>(null);
  const [fixNote, setFixNote] = useState("");
  const [shot, setShot] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/club/posts");
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to load");
      setPosts(data.posts);
      setRules(data.rules);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: string, extra: Record<string, any> = {}, done?: string) {
    setBusy(`${id}:${action}`);
    try {
      const res = await fetch(`/api/club/posts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error);
      showToast(done || "Saved");
      setFixFor(null);
      setFixNote("");
      await load();
    } catch (e: any) {
      showToast(e.message || "Something went wrong", true);
    } finally {
      setBusy(null);
    }
  }

  const groups = useMemo(() => {
    const g: Record<string, Post[]> = {};
    for (const p of posts) {
      const k = p.postStage === "verified" ? "posted" : p.featured?.hidden && p.postStage !== "not_posted" ? "posted" : p.postStage;
      (g[k] ||= []).push(p);
    }
    g.due?.sort((a, b) => b.daysLate - a.daysLate);
    g.waiting?.sort((a, b) => a.partyDate.localeCompare(b.partyDate));
    g.proof?.sort((a, b) => (a.post?.submittedAt || "").localeCompare(b.post?.submittedAt || ""));
    return g;
  }, [posts]);

  const wa = (p: Post, text: string) => `https://wa.me/91${p.whatsapp}?text=${encodeURIComponent(text)}`;
  const isBusy = (p: Post, a: string) => busy === `${p.id}:${a}`;

  function row(p: Post) {
    const name = `${p.address.firstName} ${p.address.lastName}`.trim();
    return (
      <div key={p.id} style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "14px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <Link href={`/club/applications/${p.id}`} style={{ fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" }}>
            {name || p.recipientName}
          </Link>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            @{p.instagram} · {p.id} · {p.occasionName} {day(p.partyDate)}
          </div>
          {p.post?.postedFrom && p.post.postedFrom !== p.instagram && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Posted from @{p.post.postedFrom}</div>}
          {p.postStage === "fix" && p.post?.fixNote && <div style={{ fontSize: 12, marginTop: 4 }}>Asked: “{p.post.fixNote}”</div>}
          {p.post?.featureConsent === false && <span className="badge badge-neutral" style={{ textTransform: "none", marginTop: 4 }}>Didn&apos;t agree to be featured</span>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(p.postStage === "due" || p.postStage === "fix") && (
            <span className={`badge ${p.overdue ? "badge-error" : p.daysLate > 0 ? "badge-warning" : "badge-info"}`} style={{ textTransform: "none" }}>
              {p.daysLate === 0 ? "Posting window open" : `${p.daysLate} day${p.daysLate === 1 ? "" : "s"} late`}
            </span>
          )}
          {p.postStage === "proof" && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>sent {fmtDate(p.post?.submittedAt)}</span>}
          {p.postStage === "featured" && p.featured && <span className="badge badge-success" style={{ textTransform: "none" }}>On the wall till {fmtDate(p.featured.until)}</span>}
          {p.postStage === "not_posted" && <span className="badge badge-error">{p.blocked ? "Blocked" : "Not posted"}</span>}

          {p.post?.reelUrl && (
            <a className="btn-ghost" href={p.post.reelUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", height: 30, padding: "0 10px" }}>
              Reel <ExternalLink size={12} />
            </a>
          )}
          {p.post?.storyShot && (
            <button className="btn-ghost" style={{ height: 30, padding: "0 10px" }} onClick={() => setShot(p.id)}>
              <ImageIcon size={13} /> Story
            </button>
          )}

          {p.postStage === "proof" && (
            <>
              <button className="btn-ghost" style={{ height: 30, padding: "0 10px" }} onClick={() => setFixFor(fixFor === p.id ? null : p.id)}>
                Ask to fix
              </button>
              <button className="btn-ghost" style={{ height: 30, padding: "0 10px" }} disabled={!!busy} onClick={() => act(p.id, "approve", {}, "Post approved")}>
                <Check size={13} /> Approve
              </button>
              {p.post?.featureConsent !== false && (
                <button className="btn-primary" style={{ height: 30, padding: "0 12px" }} disabled={!!busy} onClick={() => act(p.id, "feature", {}, `Featured for ${rules?.featureDays} days`)}>
                  <Sparkles size={13} /> {isBusy(p, "feature") ? "Featuring…" : "Approve & feature"}
                </button>
              )}
            </>
          )}
          {p.postStage === "verified" && p.post?.featureConsent !== false && !p.featured && (
            <button className="btn-ghost" style={{ height: 30, padding: "0 10px" }} disabled={!!busy} onClick={() => act(p.id, "feature", {}, "Featured")}>
              <Sparkles size={13} /> Feature
            </button>
          )}
          {p.featured && p.postStage !== "not_posted" && (
            <button className="btn-ghost" style={{ height: 30, padding: "0 10px" }} disabled={!!busy} onClick={() => act(p.id, p.featured!.hidden ? "show" : "hide", {}, p.featured!.hidden ? "Back on the wall" : "Taken off the wall")}>
              {p.featured.hidden ? <Eye size={13} /> : <EyeOff size={13} />} {p.featured.hidden ? "Show again" : "Hide"}
            </button>
          )}
          {(p.postStage === "due" || p.postStage === "fix") && (
            <>
              <a
                className="btn-ghost"
                href={wa(
                  p,
                  p.postStage === "fix"
                    ? `Hi ${p.address.firstName}! About your Hickoku Club post (${p.id}): ${p.post?.fixNote || "please check it"}. Send it again from your status page. Thank you!`
                    : `Hi ${p.address.firstName}! Hope the ${p.occasionName.toLowerCase()} was lovely 🎉 Please post the unwrap Reel${rules ? ` tagging ${rules.handle} with ${rules.hashtags.join(" ")}` : ""} and send the link from your Hickoku Club status page.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", height: 30, padding: "0 10px" }}
              >
                <MessageCircle size={13} /> {p.daysLate > 0 ? "Nudge" : "Reminder"}
              </a>
              <button
                className="btn-ghost"
                style={{ height: 30, padding: "0 10px", color: "#b42318" }}
                disabled={!!busy}
                onClick={() => confirm(`Mark ${p.id} as "did not post"?${rules?.autoBlock ? ` This also blocks @${p.instagram} and their phone numbers.` : ""}`) && act(p.id, "not_posted", {}, rules?.autoBlock ? "Marked as not posted and blocked" : "Marked as not posted")}
              >
                <Ban size={13} /> Did not post
              </button>
            </>
          )}
        </div>

        {fixFor === p.id && (
          <div style={{ flexBasis: "100%", display: "flex", gap: 8 }}>
            <input className="input-field" style={{ flex: 1 }} placeholder={`e.g. The ${rules?.handle || ""} tag is missing from the Reel`} value={fixNote} onChange={(e) => setFixNote(e.target.value)} autoFocus aria-label="What needs fixing" />
            <button className="btn-primary" disabled={!fixNote.trim() || !!busy} onClick={() => act(p.id, "fix", { note: fixNote }, "Sent back. They'll see your note on their status page.")}>
              Send back
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <AdminLayout
      title="Posts & features"
      subtitle="Check Reels and Stories, then feature the good ones."
      action={
        <button className="btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} /> Refresh
        </button>
      }
    >
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !posts.length && !error && <LoadingState message="Loading posts…" />}
      {!loading && !error && posts.length === 0 && <EmptyState message="No approved gifts yet. Approve applications first." />}

      {rules && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Rules: post within {rules.postWithinHours} hours of the occasion; mark “did not post” after {rules.notPostedAfterDays} days{rules.autoBlock ? " (blocks them automatically)" : ""}; featured posts stay on the wall {rules.featureDays} days.
        </p>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {SECTIONS.filter((s) => groups[s.key]?.length).map((s) => (
          <div key={s.key} className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "baseline", gap: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</h2>
              <span className="tab-count">{groups[s.key].length}</span>
              {s.note && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.note}</span>}
            </div>
            {groups[s.key].map(row)}
          </div>
        ))}
      </div>

      {shot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Story screenshot"
          onClick={() => setShot(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/club/applications/${shot}/proof`} alt={`Story screenshot for ${shot}`} style={{ maxHeight: "85vh", maxWidth: "90vw", borderRadius: 10, background: "#fff" }} />
            <button className="btn-ghost" autoFocus onClick={() => setShot(null)} aria-label="Close" style={{ position: "absolute", top: 8, right: 8, background: "#fff" }}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {toast}
    </AdminLayout>
  );
}
