import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatRelativeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  if (days <= 0 && hours <= 0) {
    const mins = Math.max(1, Math.floor(ms / 60_000));
    return `${mins}m ago`;
  }
  if (days <= 0) return `${hours}h ago`;
  if (remH === 0) return `${days}d ago`;
  return `${days}d ${remH}h ago`;
}

export function formatDurationSince(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "0h";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  if (days <= 0) return `${hours}h`;
  return `${days}d ${remH}h`;
}
