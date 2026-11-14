"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X, ChevronLeft, ChevronRight, Maximize2, Loader2, AlertCircle, Star, Link2, RotateCcw } from "lucide-react";

// Product image manager: upload (drag & drop or picker) with instant local
// preview, drag-to-reorder, first image = cover, remove, full-size lightbox,
// and "add by path/URL" for images that already live in the storefront.

const STOREFRONT = (process.env.NEXT_PUBLIC_STOREFRONT_URL || "").replace(/\/$/, "");
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// Stored values are either storefront paths (/hickoku-assets/…) or full URLs.
export function imageSrc(u: string) {
  return u.startsWith("/") ? `${STOREFRONT}${u}` : u;
}

type Pending = { tempId: string; preview: string; name: string; error?: string; file: File };

function Thumb({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--text-muted)", fontSize: 11, padding: 8, textAlign: "center" }}>
        <AlertCircle size={18} /> Can&apos;t load image
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setBroken(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
}

export default function ImageManager({
  images,
  onChange,
  productKey,
  writable,
  uploadsEnabled,
  productName,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  productKey: string;
  writable: boolean;
  uploadsEnabled: boolean;
  productName: string;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  // Uploads finish out of order; always append to the latest list.
  const latest = useRef(images);
  useEffect(() => {
    latest.current = images;
  }, [images]);

  const upload = useCallback(
    async (p: Pending) => {
      setPending((list) => list.map((x) => (x.tempId === p.tempId ? { ...x, error: undefined } : x)));
      try {
        const fd = new FormData();
        fd.append("file", p.file);
        fd.append("productKey", productKey);
        const res = await fetch("/api/products/images", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!data.success) throw new Error(data.error || `Upload failed (${res.status})`);
        onChange([...latest.current, data.url]);
        setPending((list) => list.filter((x) => x.tempId !== p.tempId));
        URL.revokeObjectURL(p.preview);
      } catch (e: any) {
        setPending((list) => list.map((x) => (x.tempId === p.tempId ? { ...x, error: e.message } : x)));
      }
    },
    [onChange, productKey],
  );

  function addFiles(files: FileList | File[]) {
    const next: Pending[] = [];
    for (const file of Array.from(files)) {
      const tempId = `${Date.now()}-${Math.random()}`;
      const preview = URL.createObjectURL(file);
      let error: string | undefined;
      if (!TYPES.includes(file.type)) error = "Use JPG, PNG, WebP or AVIF";
      else if (file.size > MAX_BYTES) error = `${(file.size / 1048576).toFixed(1)} MB, max is 5 MB`;
      next.push({ tempId, preview, name: file.name, file, error });
    }
    setPending((list) => [...list, ...next]);
    next.filter((p) => !p.error).forEach(upload);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function addUrl() {
    const u = urlInput.trim();
    if (!u) return;
    if (!(u.startsWith("/") || u.startsWith("https://"))) return setUrlError("Use a storefront path like /hickoku-assets/… or an https:// link");
    if (images.includes(u)) return setUrlError("That image is already added");
    onChange([...images, u]);
    setUrlInput("");
    setUrlError("");
  }

  // Lightbox keyboard controls.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, images.length]);

  const tile: React.CSSProperties = { position: "relative", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-hover)" };
  const iconBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: "none", background: "rgba(255,255,255,0.94)", color: "#101828", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,0.15)" };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
        {images.map((u, i) => (
          <div
            key={`${u}-${i}`}
            className="img-tile"
            draggable={writable}
            onDragStart={() => setDragIndex(i)}
            onDragEnter={() => dragIndex !== null && setOverIndex(i)}
            onDragOver={(e) => dragIndex !== null && e.preventDefault()}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
            style={{
              ...tile,
              ...(i === 0 ? { gridColumn: "span 2", gridRow: "span 2" } : {}),
              cursor: writable ? "grab" : "default",
              opacity: dragIndex === i ? 0.4 : 1,
              outline: overIndex === i && dragIndex !== i ? "2px solid var(--primary)" : "none",
              outlineOffset: 2,
            }}
          >
            <Thumb src={imageSrc(u)} alt={`${productName} image ${i + 1}`} />
            {i === 0 && (
              <span className="badge badge-neutral" style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.94)" }}>
                <Star size={11} fill="currentColor" style={{ marginLeft: -2 }} /> Cover
              </span>
            )}
            <div className="img-tools" style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
              <button type="button" style={iconBtn} title="View full size" aria-label="View full size" onClick={() => setLightbox(i)}>
                <Maximize2 size={14} />
              </button>
              {writable && (
                <button type="button" style={{ ...iconBtn, color: "#b42318" }} title="Remove" aria-label="Remove image" onClick={() => onChange(images.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              )}
            </div>
            {writable && images.length > 1 && (
              <div className="img-tools" style={{ position: "absolute", bottom: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between" }}>
                <button type="button" style={{ ...iconBtn, visibility: i === 0 ? "hidden" : "visible" }} title="Move earlier" aria-label="Move earlier" onClick={() => move(i, i - 1)}>
                  <ChevronLeft size={15} />
                </button>
                {i !== 0 && (
                  <button type="button" style={{ ...iconBtn, width: "auto", padding: "0 8px", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-display)" }} onClick={() => move(i, 0)}>
                    Make cover
                  </button>
                )}
                <button type="button" style={{ ...iconBtn, visibility: i === images.length - 1 ? "hidden" : "visible" }} title="Move later" aria-label="Move later" onClick={() => move(i, i + 1)}>
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        ))}

        {pending.map((p) => (
          <div key={p.tempId} style={tile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 10,
                textAlign: "center",
                fontSize: 11,
                fontWeight: 500,
                color: p.error ? "#b42318" : "var(--text-primary)",
                background: p.error ? "rgba(254,243,242,0.85)" : "transparent",
              }}
            >
              {p.error ? <AlertCircle size={18} /> : <Loader2 size={20} style={{ animation: "spin 0.7s linear infinite" }} />}
              <span style={{ overflowWrap: "anywhere" }}>{p.error || "Uploading…"}</span>
              {p.error && (
                <div style={{ display: "flex", gap: 6 }}>
                  {TYPES.includes(p.file.type) && p.file.size <= MAX_BYTES && (
                    <button type="button" style={iconBtn} title="Retry" aria-label="Retry upload" onClick={() => upload(p)}>
                      <RotateCcw size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    style={iconBtn}
                    title="Dismiss"
                    aria-label="Dismiss"
                    onClick={() => {
                      URL.revokeObjectURL(p.preview);
                      setPending((l) => l.filter((x) => x.tempId !== p.tempId));
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {writable && (
          <button
            type="button"
            disabled={!uploadsEnabled}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              if (!uploadsEnabled || dragIndex !== null) return;
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              if (!uploadsEnabled || dragIndex !== null) return;
              e.preventDefault();
              setDropActive(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            style={{
              ...tile,
              ...(images.length === 0 ? { gridColumn: "1 / -1", aspectRatio: "auto", minHeight: 170 } : {}),
              border: `1.5px dashed ${dropActive ? "var(--primary)" : "var(--border-bright)"}`,
              background: dropActive ? "var(--bg-hover)" : "#fff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: uploadsEnabled ? "pointer" : "not-allowed",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-display)",
              fontSize: 12,
              padding: 12,
              textAlign: "center",
            }}
          >
            <ImagePlus size={22} />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{uploadsEnabled ? "Add images" : "Upload not set up"}</span>
            <span style={{ color: "var(--text-muted)" }}>{uploadsEnabled ? "Drop files or click · JPG, PNG, WebP · max 5 MB" : "Needs an S3 bucket. You can still add existing image paths below."}</span>
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {writable && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Link2 size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                className="input-field"
                value={urlInput}
                placeholder="Add existing image: /hickoku-assets/velvira/Velvira1.JPG or https://…"
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setUrlError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                style={{ width: "100%", paddingLeft: 32, fontSize: 13 }}
              />
            </div>
            <button type="button" className="btn-ghost" onClick={addUrl} disabled={!urlInput.trim()}>
              Add
            </button>
          </div>
          {urlError && <p style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>{urlError}</p>}
          {images.length > 1 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Drag images to reorder. The first one is the cover shown in listings.</p>}
        </div>
      )}

      {lightbox !== null && images[lightbox] && (
        <div className="modal-backdrop" style={{ background: "rgba(12,17,29,0.85)" }} onMouseDown={(e) => e.target === e.currentTarget && setLightbox(null)}>
          <div style={{ position: "relative", maxWidth: "min(1000px, 92vw)", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }} role="dialog" aria-modal="true" aria-label="Image preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(images[lightbox])} alt={`${productName} image ${lightbox + 1}`} style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 10, background: "#fff", objectFit: "contain" }} />
            <div style={{ color: "#fff", fontSize: 13, display: "flex", gap: 12, alignItems: "center", maxWidth: "100%" }}>
              <span>
                {lightbox + 1} / {images.length}
                {lightbox === 0 ? " · Cover" : ""}
              </span>
              <span className="code" style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{images[lightbox]}</span>
            </div>
            <button type="button" aria-label="Close preview" onClick={() => setLightbox(null)} style={{ ...iconBtn, position: "fixed", top: 20, right: 20, width: 36, height: 36 }}>
              <X size={18} />
            </button>
            {images.length > 1 && (
              <>
                <button type="button" aria-label="Previous image" onClick={() => setLightbox((lightbox - 1 + images.length) % images.length)} style={{ ...iconBtn, position: "fixed", left: 20, top: "50%", width: 40, height: 40 }}>
                  <ChevronLeft size={20} />
                </button>
                <button type="button" aria-label="Next image" onClick={() => setLightbox((lightbox + 1) % images.length)} style={{ ...iconBtn, position: "fixed", right: 20, top: "50%", width: 40, height: 40 }}>
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
