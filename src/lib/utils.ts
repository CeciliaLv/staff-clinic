import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export const todayStr = new Date().toISOString().slice(0, 10);

export function monthOf(ds: string) {
  return String(ds || "").slice(0, 7);
}

export function daysBetween(a: string, b: string) {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  return Math.round((y - x) / 86400000);
}

export const NEAR_EXP_DAYS = 90;

export const TAX_DEFAULT = 0.13;
