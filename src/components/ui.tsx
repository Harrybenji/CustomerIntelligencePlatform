import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import type { Priority, Status } from "../types/dashboard";

const statusStyles: Record<Status, string> = {
  good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  warning: "border-yellow-400/25 bg-yellow-400/10 text-yellow-100",
  danger: "border-red-400/25 bg-red-400/10 text-red-200",
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-100",
};

const priorityStyles: Record<Priority, string> = {
  High: "border-red-400/30 bg-red-400/10 text-red-100",
  Medium: "border-yellow-400/30 bg-yellow-400/10 text-yellow-100",
  Low: "border-sky-400/30 bg-sky-400/10 text-sky-100",
};

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-950/85 shadow-2xl shadow-black/20 ${className}`}>
      {children}
    </section>
  );
}

export function Badge({
  children,
  status = "neutral",
  priority,
  className = "",
}: PropsWithChildren<{ status?: Status; priority?: Priority; className?: string }>) {
  const styles = priority ? priorityStyles[priority] : statusStyles[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles} ${className}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-yellow-300/25 bg-zinc-900 px-3 text-sm font-medium text-zinc-50 shadow-sm shadow-black/20 transition hover:border-yellow-300/70 hover:bg-yellow-300/15 hover:text-yellow-100 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-600 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
