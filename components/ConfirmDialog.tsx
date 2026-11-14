"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

// A single, app-styled confirmation step (replaces window.confirm/prompt).
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  busyLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ busy, onClose });
  useEffect(() => {
    latest.current = { busy, onClose };
  });

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !latest.current.busy) latest.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div style={{ padding: "22px 24px 0", display: "flex", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: tone === "danger" ? "var(--accent-red-glow)" : "var(--bg-hover)",
              color: tone === "danger" ? "var(--accent-red)" : "var(--text-secondary)",
              border: `6px solid ${tone === "danger" ? "#fffbfa" : "#f9fafb"}`,
              boxSizing: "content-box",
              margin: -6,
            }}
          >
            <AlertTriangle size={18} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="confirm-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, marginTop: 2 }}>{title}</h2>
            <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>{children}</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "22px 24px 20px" }}>
          <button ref={cancelRef} className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={tone === "danger" ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} style={{ animation: "spin 0.6s linear infinite" }} />}
            {busy ? busyLabel || confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
