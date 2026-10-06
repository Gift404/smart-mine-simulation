import type { SignalSample } from "../types";

/** Best (strongest) RSSI per timestamp — used by AnalyticsPanel sparklines */
export function bestRssiSeries(samples: SignalSample[]): number[] {
  const rssiByTs = new Map<number, number>();
  for (const s of samples) {
    const prev = rssiByTs.get(s.ts);
    if (prev === undefined || s.rssi > prev) rssiByTs.set(s.ts, s.rssi);
  }
  return [...rssiByTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, rssi]) => rssi);
}
