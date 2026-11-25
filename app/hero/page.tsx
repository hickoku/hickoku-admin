"use client";

import { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { UploadCloud, CheckCircle2, Trash2, Copy, ImageIcon, RefreshCw } from "lucide-react";
import { readJson } from "@/lib/readJson";

type HeroImage = { key: string; url: string; size?: number; uploadedAt?: string };

export default function HeroPage() {
  const [images, setImages] = useState<HeroImage[]>([]);
  const [active, setActive] = useState<{ key: string; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hero");
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Failed to load hero images");
      setImages(data.images || []);
      setActive(data.active || null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function uploadFile(file: File, setActiveOnUpload: boolean) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("setActive", String(setActiveOnUpload));
      const res = await fetch("/api/hero", { method: "POST", body: form });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Upload failed");
      await load();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setAsActive(key: string) {
    try {
      const res = await fetch("/api/hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error);
      await load();
    } catch (e: any) {
      setUploadError(e.message);
    }
  }

  async function deleteImage(key: string) {
    if (!confirm("Delete this image permanently from S3?")) return;
    try {
      const res = await fetch(`/api/hero?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error);
      await load();
    } catch (e: any) {
      setUploadError(e.message);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file, images.length === 0);
  }

  function copyUrl() {
    if (!active) return;
    navigator.clipboard.writeText(active.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AdminLayout title="Hero Section" subtitle="Upload & manage the homepage hero banner — stored in AWS S3">
      {loading && <LoadingState message="Loading hero images from S3..." />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <div className="animate-in">
          {/* Currently active hero */}
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={15} color="var(--accent-emerald)" /> Live on Homepage
            </h3>
            {!active ? (
              <EmptyState message="No hero image set yet — upload one below and mark it active" />
            ) : (
              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <img
                  src={active.url}
                  alt="Active hero"
                  style={{ width: 280, height: 140, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border-bright)" }}
                />
                <div style={{ flex: 1, minWidth: 240 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    Point your storefront's homepage hero at this public URL (or read it from the S3 manifest at{" "}
                    <code className="mono">site-config/hero.json</code>):
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div className="input-field mono" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {active.url}
                    </div>
                    <button className="btn-ghost" onClick={copyUrl} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Copy size={13} /> {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload */}
          <div
            className="card"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              padding: 32,
              marginBottom: 24,
              textAlign: "center",
              borderStyle: "dashed",
              borderColor: dragOver ? "var(--accent-gold)" : "var(--border)",
              background: dragOver ? "var(--accent-gold-glow)" : "var(--bg-card)",
              cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file, images.length === 0);
              }}
            />
            <UploadCloud size={28} color="var(--accent-gold)" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{uploading ? "Uploading..." : "Drop an image here or click to browse"}</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>JPEG, PNG, WebP or AVIF · up to 8MB · recommends 1920×960</p>
            {uploadError && <p style={{ color: "var(--accent-red)", fontSize: 12, marginTop: 12 }}>⚠ {uploadError}</p>}
          </div>

          {/* Gallery */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
              Uploaded Images ({images.length})
            </h3>
            <button className="btn-ghost" onClick={load} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {images.length === 0 ? (
            <EmptyState message="No images uploaded yet" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {images.map((img) => {
                const isActive = active?.key === img.key;
                return (
                  <div key={img.key} className="card" style={{ overflow: "hidden" }}>
                    <div style={{ position: "relative" }}>
                      <img src={img.url} alt={img.key} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                      {isActive && (
                        <div
                          style={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            padding: "3px 9px",
                            borderRadius: 20,
                            background: "rgba(63,174,122,0.9)",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={11} /> ACTIVE
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 12 }}>
                      <p className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {img.key.replace("hero/", "")}
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {!isActive && (
                          <button className="btn-primary" onClick={() => setAsActive(img.key)} style={{ flex: 1, fontSize: 11, padding: "6px 10px" }}>
                            Set Active
                          </button>
                        )}
                        <button className="btn-danger" onClick={() => deleteImage(img.key)} style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
