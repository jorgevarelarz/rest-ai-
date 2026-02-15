import type { RestaurantTable } from "../../types";
import type { Reservation } from "./types";
import { getReservationSettings } from "./settings";
import { parseTimeToMinutes, minutesToHHMM, roundToSlot } from "./timeSlots";

type Window = { startMin: number; endMin: number };

const isOverlapping = (a: Window, b: Window): boolean => a.startMin < b.endMin && a.endMin > b.startMin;

const toWindow = (timeHHMM: string, durationMin: number, bufferMin: number): Window | null => {
  const startMin = parseTimeToMinutes(timeHHMM);
  if (!Number.isFinite(startMin)) return null;
  return { startMin, endMin: startMin + durationMin + bufferMin };
};

export function listAvailableTablesForReservation(
  restaurantId: string,
  date: string,
  time: string,
  partySize: number,
  tables: RestaurantTable[],
  reservations: Reservation[],
  excludeReservationId?: string
): RestaurantTable[] {
  const cfg = getReservationSettings(restaurantId);
  const rawMin = parseTimeToMinutes(time);
  if (!Number.isFinite(rawMin)) return [];
  const roundedMin = roundToSlot(rawMin, cfg.slotIntervalMin, cfg.slotRounding);
  const normalizedTime = minutesToHHMM(roundedMin);

  const target = toWindow(normalizedTime, cfg.standardDurationMin, cfg.bufferMin);
  if (!target) return [];

  const relevant = reservations.filter((r) => r.restaurant_id === restaurantId && r.date === date && r.status === "active");

  return tables
    .filter((t) => t.restaurant_id === restaurantId)
    .filter((t) => t.status !== "blocked")
    .filter((t) => (t.kind === "stool" ? 1 : t.capacity) >= partySize)
    .filter((t) => {
      for (const r of relevant) {
        if (excludeReservationId && r.id === excludeReservationId) continue;
        if (!r.table_id) continue;
        if (r.table_id !== t.id) continue;
        const w = toWindow(r.time, cfg.standardDurationMin, cfg.bufferMin);
        if (!w) continue;
        if (isOverlapping(target, w)) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const ca = a.kind === "stool" ? 1 : a.capacity;
      const cb = b.kind === "stool" ? 1 : b.capacity;
      return ca - cb || a.name.localeCompare(b.name);
    });
}

export function pickTableForReservation(
  restaurantId: string,
  date: string,
  time: string,
  partySize: number,
  tables: RestaurantTable[],
  reservations: Reservation[],
  excludeReservationId?: string
): RestaurantTable | null {
  const avail = listAvailableTablesForReservation(restaurantId, date, time, partySize, tables, reservations, excludeReservationId);
  return avail[0] ?? null;
}

export function suggestAlternativeTimesByTables(
  restaurantId: string,
  date: string,
  time: string,
  partySize: number,
  tables: RestaurantTable[],
  reservations: Reservation[],
  limit = 2
): { date: string; time: string }[] {
  const cfg = getReservationSettings(restaurantId);
  const rawMin = parseTimeToMinutes(time);
  if (!Number.isFinite(rawMin)) return [];
  const roundedMin = roundToSlot(rawMin, cfg.slotIntervalMin, cfg.slotRounding);
  const reqMin = roundedMin;

  // Find shift for requested time (or nearest shift), then scan slots for any free table.
  const shifts = cfg.openingHours.slice();
  const timeInShift = shifts.find((s) => {
    const start = parseTimeToMinutes(s.start);
    const end = parseTimeToMinutes(s.end);
    return reqMin >= start && reqMin < end;
  });

  const activeShift = timeInShift ?? shifts[0] ?? null;
  if (!activeShift) return [];

  const shiftStart = parseTimeToMinutes(activeShift.start);
  const shiftEnd = parseTimeToMinutes(activeShift.end);
  const latestStart = shiftEnd - cfg.standardDurationMin;
  if (!Number.isFinite(shiftStart) || !Number.isFinite(shiftEnd)) return [];

  const candidates: number[] = [];
  for (let t = shiftStart; t <= latestStart; t += cfg.slotIntervalMin) {
    if (t === reqMin) continue;
    candidates.push(t);
  }

  candidates.sort((a, b) => {
    const da = Math.abs(a - reqMin);
    const db = Math.abs(b - reqMin);
    if (da !== db) return da - db;
    return a - b;
  });

  const out: { date: string; time: string }[] = [];
  for (const t of candidates) {
    if (out.length >= limit) break;
    const hhmm = minutesToHHMM(t);
    const ok = pickTableForReservation(restaurantId, date, hhmm, partySize, tables, reservations) != null;
    if (ok) out.push({ date, time: hhmm });
  }
  return out;
}

