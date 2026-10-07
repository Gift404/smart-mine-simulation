/** Human-readable names for zone ids and alert types coming from either simulation. */

const ZONE_NAMES: Record<string, string> = {
  VERT_WEST: "West vertical",
  VERT_EAST: "East vertical",
  HORIZ_NORTH: "North drift",
  HORIZ_MID: "Mid drift",
  HORIZ_SOUTH: "South drift",
  MINE: "Whole mine",
};

function sentenceCase(raw: string): string {
  const s = raw.replace(/_/g, " ").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function depthLabel(digits: string): string {
  return `${String(Number(digits)).replace(/\B(?=(\d{3})+$)/g, " ")} m`;
}

/** "L950_HAULAGE" → "950 m · Haulage", "S3_SHAFT" → "Shaft 3", "VENT_SHAFT" → "Vent shaft". */
export function placeName(zoneId: string | null | undefined): string {
  if (!zoneId) return "Unknown location";
  if (ZONE_NAMES[zoneId]) return ZONE_NAMES[zoneId];
  const level = /^L(\d+)_(.+)$/i.exec(zoneId);
  if (level) return `${depthLabel(level[1])} · ${sentenceCase(level[2])}`;
  const levelOnly = /^L(\d+)$/i.exec(zoneId);
  if (levelOnly) return `${depthLabel(levelOnly[1])} level`;
  const shaft = /^S(\d+)_SHAFT$/i.exec(zoneId);
  if (shaft) return `Shaft ${shaft[1]}`;
  return sentenceCase(zoneId);
}

const ALERT_NAMES: Record<string, string> = {
  HIGH_HR: "High heart rate",
  LOW_SPO2: "Low blood oxygen",
  HIGH_METHANE: "High methane",
  LOW_O2: "Low oxygen",
  LOW_BATTERY: "Low wearable battery",
  COMM_LOSS: "Lost communication",
  FALL_DETECTED: "Fall detected",
  PANIC_BUTTON: "Panic button",
  RESTRICTED_ZONE: "Restricted zone entry",
};

/** "RESTRICTED_ZONE:GF-CRUSHER" → "Restricted zone entry". */
export function alertTypeName(type: string): string {
  const base = type.split(":")[0];
  return ALERT_NAMES[base] ?? sentenceCase(base);
}
