export type SlotRoundingMode = "nearest" | "floor" | "ceil";

// Pure parsing helper: returns minutes from midnight.
// Accepts "21", "21:0", "21:00", "9", "9:15".
// Returns NaN for invalid inputs (callers decide how to handle it).
export function parseTimeToMinutes(input: string): number {
  const raw = input.trim();
  if (!raw) return Number.NaN;

  const m = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return Number.NaN;

  const h = Number(m[1]);
  const mm = m[2] === undefined ? 0 : Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(mm)) return Number.NaN;
  if (h < 0 || h > 23) return Number.NaN;
  if (mm < 0 || mm > 59) return Number.NaN;

  return h * 60 + mm;
}

// Pure formatting helper: minutes -> "HH:MM".
// Clamps into [0, 1439] to guarantee 00-23 output hours.
export function minutesToHHMM(min: number): string {
  if (!Number.isFinite(min)) return "00:00";
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Pure rounding helper: rounds "min" to the nearest slot interval.
export function roundToSlot(min: number, interval: number, mode: SlotRoundingMode): number {
  if (!Number.isFinite(min)) return Number.NaN;
  if (!Number.isFinite(interval) || interval <= 0) return min;

  const ratio = min / interval;
  const slots =
    mode === "floor" ? Math.floor(ratio) :
    mode === "ceil" ? Math.ceil(ratio) :
    Math.round(ratio);

  return slots * interval;
}

