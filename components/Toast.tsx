"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type ToastState = { message: string; error?: boolean; key: number } | null;

// Small bottom-centre notice that clears itself. Usage:
//   const { toast, showToast } = useToast();  …  {toast}
export function useToast() {
  const [state, setState] = useState<ToastState>(null);
  const showToast = useCallback((message: string, error = false) => setState({ message, error, key: Date.now() }), []);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), state.error ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [state]);

  const toast = state ? (
    <div key={state.key} className={`toast ${state.error ? "error" : ""}`} role="status">
      {state.error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
      {state.message}
    </div>
  ) : null;

  return { toast, showToast };
}
