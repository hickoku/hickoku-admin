"use client";

// Small shared building blocks for admin edit forms (products, offers).
export function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 22, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ color: "var(--text-muted)", display: "flex" }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; id: string; disabled?: boolean }) {
  return (
    <span className={`switch ${checked ? "on" : ""}`} style={disabled ? { opacity: 0.5 } : undefined}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="knob" />
    </span>
  );
}
