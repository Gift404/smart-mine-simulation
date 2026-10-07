import { describe, expect, it } from "vitest";
import { alertTypeName, placeName } from "./labels";

describe("placeName", () => {
  it("turns level zone ids into depth + area", () => {
    expect(placeName("L950_HAULAGE")).toBe("950 m · Haulage");
    expect(placeName("L850_ORE_DRIVE")).toBe("850 m · Ore drive");
    expect(placeName("L1090_CRUSHER")).toBe("1 090 m · Crusher");
  });

  it("names shafts and other infrastructure", () => {
    expect(placeName("S3_SHAFT")).toBe("Shaft 3");
    expect(placeName("VENT_SHAFT")).toBe("Vent shaft");
    expect(placeName("DECLINE_RAMP")).toBe("Decline ramp");
    expect(placeName("VERT_WEST")).toBe("West vertical");
    expect(placeName(null)).toBe("Unknown location");
  });
});

describe("alertTypeName", () => {
  it("drops the geofence suffix and uses plain words", () => {
    expect(alertTypeName("RESTRICTED_ZONE:GF-CRUSHER")).toBe("Restricted zone entry");
    expect(alertTypeName("HIGH_METHANE")).toBe("High methane");
    expect(alertTypeName("SOMETHING_NEW")).toBe("Something new");
  });
});
