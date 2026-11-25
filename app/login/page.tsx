"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { readJson } from "@/lib/readJson";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await readJson(res);
      if (!data.success) throw new Error(data.error || "Login failed");
      router.replace(params.get("next") || "/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 0%, rgba(203,161,53,0.08), transparent 60%), var(--bg)",
        padding: 20,
      }}
    >
      <div className="card animate-in" style={{ width: "100%", maxWidth: 380, padding: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--gradient-gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Sparkles size={22} color="#14120a" />
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Hickoku Admin</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
            Admin Password
          </label>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Lock
              size={14}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
            />
            <input
              type="password"
              className="input-field"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={{ width: "100%", paddingLeft: 34 }}
            />
          </div>

          {error && (
            <p style={{ color: "var(--accent-red)", fontSize: 12, marginBottom: 16, fontFamily: "var(--font-mono)" }}>
              ⚠ {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading || !password} style={{ width: "100%" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
