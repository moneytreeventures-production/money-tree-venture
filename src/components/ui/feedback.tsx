import type { ReactNode } from "react";

type Tone = "loading" | "success" | "error" | "warning" | "empty";
const toneClass: Record<Tone, string> = {
  loading: "border-border bg-surface text-foreground-secondary",
  success: "border-success/30 bg-success/10 text-foreground",
  error: "border-danger/30 bg-danger/10 text-foreground",
  warning: "border-warning/30 bg-warning/10 text-foreground",
  empty: "border-border bg-surface-secondary text-foreground-secondary",
};

export function Feedback({ tone, title, children, action, className = "" }: { tone: Tone; title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  const role = tone === "error" ? "alert" : tone === "empty" ? undefined : "status";
  return <div role={role} className={`rounded-2xl border p-5 text-sm ${toneClass[tone]} ${className}`}><div>{title && <p className="font-semibold text-foreground">{title}</p>}<div className={title ? "mt-2" : ""}>{children}</div></div>{action && <div className="mt-4">{action}</div>}</div>;
}
