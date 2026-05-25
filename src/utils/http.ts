import { config } from "../config.js";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(config.requestTimeoutMs);
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? timeoutSignal,
    headers: {
      "accept": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function hoursUntil(date?: string): number | undefined {
  if (!date) return undefined;
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return undefined;
  return (timestamp - Date.now()) / 3_600_000;
}
