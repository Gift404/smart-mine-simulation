import { describe, expect, it } from "vitest";
import { bestRssiSeries } from "./rssiSeries";
import type { SignalSample } from "../types";

describe("bestRssiSeries", () => {
  it("picks the strongest RSSI at each timestamp", () => {
    const samples: SignalSample[] = [
      { ts: 1, gateway_id: "GW01", rssi: -90 },
      { ts: 1, gateway_id: "GW02", rssi: -70 },
      { ts: 2, gateway_id: "GW01", rssi: -85 },
    ];
    expect(bestRssiSeries(samples)).toEqual([-70, -85]);
  });

  it("returns empty for no samples", () => {
    expect(bestRssiSeries([])).toEqual([]);
  });
});

describe("scenario labels", () => {
  it("covers all SCENARIOS keys", async () => {
    const { SCENARIOS } = await import("../types");
    expect(SCENARIOS).toContain("methane");
    expect(SCENARIOS).toContain("clear");
    expect(SCENARIOS).toHaveLength(7);
  });
});
