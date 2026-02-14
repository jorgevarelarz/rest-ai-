import { ReservationRepository } from './repository';
import { AvailabilityResult, AvailabilityReason } from './types';
import { getReservationSettings } from "./settings";
import { minutesToHHMM, parseTimeToMinutes, roundToSlot } from "./timeSlots";

/**
 * Finds the shift (opening hour range) that contains the requested time.
 * We consider "contained" if the time is >= start and < end.
 */
const getShift = (cfg: ReturnType<typeof getReservationSettings>, timeMin: number) => {
  return cfg.openingHours.find(range => {
    const start = parseTimeToMinutes(range.start);
    const end = parseTimeToMinutes(range.end);
    return timeMin >= start && timeMin < end;
  });
};

const toISODateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseISODateLocal = (date: string): Date | null => {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
};

/**
 * Calculates current load for a specific window.
 * Returns true if there is enough capacity.
 */
const checkCapacity = (
  restaurantId: string,
  cfg: ReturnType<typeof getReservationSettings>,
  date: string,
  reqStart: number,
  duration: number,
  partySize: number,
  excludeReservationId?: string
): boolean => {
  const reqEnd = reqStart + duration + cfg.bufferMin;

  // Get existing reservations for that date
  const existing = ReservationRepository.getByDate(restaurantId, date);

  let currentLoad = 0;

  for (const r of existing) {
    if (excludeReservationId && r.id === excludeReservationId) continue;

    const rStart = parseTimeToMinutes(r.time);
    const rEnd = rStart + cfg.standardDurationMin + cfg.bufferMin;

    // Check overlap: (StartA < EndB) and (EndA > StartB)
    if (reqStart < rEnd && reqEnd > rStart) {
      currentLoad += r.partySize;
    }
  }

  return (cfg.totalCapacity - currentLoad) >= partySize;
};

/**
 * Main function to check availability and suggest alternatives
 */
export const AvailabilityService = {
  check: (restaurantId: string, date: string, time: string, partySize: number, excludeReservationId?: string): AvailabilityResult => {
    const cfg = getReservationSettings(restaurantId);
    const rawMin = parseTimeToMinutes(time);
    const roundedMin = roundToSlot(rawMin, cfg.slotIntervalMin, cfg.slotRounding);
    const timeMin = roundedMin;

    const rawHHMM = Number.isFinite(rawMin) ? minutesToHHMM(rawMin) : null;
    const roundedHHMM = Number.isFinite(roundedMin) ? minutesToHHMM(roundedMin) : null;
    const normalized_time = rawHHMM && roundedHHMM && rawHHMM !== roundedHHMM ? roundedHHMM : undefined;

    // --- VALIDATION 1: Closed Dates ---
    if (cfg.closedDates?.includes(date)) {
      return {
        status: 'not_available',
        reason: 'closed',
        alternatives: findNextDayAlternatives(restaurantId, date, timeMin, partySize, excludeReservationId),
        normalized_time
      };
    }
    
    // --- VALIDATION 2: Max Party Size ---
    if (partySize > cfg.maxPartySize) {
      return { 
        status: 'not_available', 
        reason: 'max_party', 
        alternatives: [], // No alternatives for groups that are too big
        normalized_time
      };
    }

    // --- VALIDATION 3: Out of Hours ---
    const activeShift = getShift(cfg, timeMin);
    if (!activeShift) {
      return {
        status: 'not_available',
        reason: 'out_of_hours',
        alternatives: findOutOfHoursAlternatives(restaurantId, date, timeMin, partySize, excludeReservationId),
        normalized_time
      };
    }

    // --- VALIDATION 4: Turn End / Duration ---
    const shiftEndMin = parseTimeToMinutes(activeShift.end);
    const bookingEndMin = timeMin + cfg.standardDurationMin;
    
    if (bookingEndMin > shiftEndMin) {
      // If the booking goes beyond closing time, we treat it as unavailable
      // But we CAN suggest alternatives earlier in the shift
      return {
        status: 'not_available',
        reason: 'turn_end',
        alternatives: findSmartAlternatives(restaurantId, date, timeMin, partySize, activeShift, excludeReservationId),
        normalized_time
      };
    }

    // --- VALIDATION 5: Capacity ---
    const hasSpace = checkCapacity(restaurantId, cfg, date, timeMin, cfg.standardDurationMin, partySize, excludeReservationId);

    if (hasSpace) {
      return { status: 'available', alternatives: [], normalized_time };
    } else {
      return {
        status: 'not_available',
        reason: 'capacity',
        alternatives: findSmartAlternatives(restaurantId, date, timeMin, partySize, activeShift, excludeReservationId),
        normalized_time
      };
    }
  }
};

/**
 * Generates alternatives ONLY within the specific shift.
 * Prioritizes earlier slots if available, then later slots.
 */
function findSmartAlternatives(
  restaurantId: string,
  date: string,
  reqTimeMin: number,
  partySize: number,
  shift: { start: string, end: string },
  excludeReservationId?: string
): { date: string; time: string }[] {
  const cfg = getReservationSettings(restaurantId);
  
  const shiftStartMin = parseTimeToMinutes(shift.start);
  const shiftEndMin = parseTimeToMinutes(shift.end);
  const candidates: number[] = [];
  
  // Generate all possible slots in the shift based on interval
  // We ensure the slot allows the full duration before shift end
  for (let t = shiftStartMin; t <= shiftEndMin - cfg.standardDurationMin; t += cfg.slotIntervalMin) {
    // Exclude the exact requested time (since we know it failed or is invalid)
    if (t !== reqTimeMin) {
      candidates.push(t);
    }
  }

  // Filter candidates by Capacity
  const validCandidates = candidates.filter(t => 
    checkCapacity(restaurantId, cfg, date, t, cfg.standardDurationMin, partySize, excludeReservationId)
  );

  // Sort:
  // 1. Difference from requested time (absolute)
  // 2. Tie-breaker: prefer earlier times (t < reqTimeMin)
  validCandidates.sort((a, b) => {
    const diffA = Math.abs(a - reqTimeMin);
    const diffB = Math.abs(b - reqTimeMin);
    
    if (diffA !== diffB) return diffA - diffB;
    
    // If distance is same (e.g. -30 vs +30), prefer earlier
    return (a < reqTimeMin) ? -1 : 1;
  });

  // Take top 2
  return validCandidates.slice(0, 2).map(min => ({
    date,
    time: minutesToHHMM(min)
  }));
}

/**
 * Finds alternatives on subsequent days for the SAME time.
 * Skips closed days.
 */
function findNextDayAlternatives(
  restaurantId: string,
  startDate: string,
  timeMin: number,
  partySize: number,
  excludeReservationId?: string
): { date: string; time: string }[] {
  const cfg = getReservationSettings(restaurantId);
  const alternatives: { date: string; time: string }[] = [];
  const current = parseISODateLocal(startDate);
  if (!current) return alternatives;
  
  // Try next 7 days
  for (let i = 0; i < 7; i++) {
    if (alternatives.length >= 2) break;
    
    current.setDate(current.getDate() + 1);
    const nextDate = toISODateLocal(current);
    
    // Check if closed
    if (cfg.closedDates?.includes(nextDate)) continue;
    
    // Check if time is valid in generic hours
    if (!getShift(cfg, timeMin)) continue;

    // Check capacity
    const hasSpace = checkCapacity(restaurantId, cfg, nextDate, timeMin, cfg.standardDurationMin, partySize, excludeReservationId);
    
    if (hasSpace) {
      alternatives.push({ date: nextDate, time: minutesToHHMM(timeMin) });
    }
  }
  
  return alternatives;
}

function getAvailableSlotsOnDate(
  restaurantId: string,
  date: string,
  partySize: number,
  minStartMin?: number,
  excludeReservationId?: string
): number[] {
  const cfg = getReservationSettings(restaurantId);
  const slots: number[] = [];

  for (const shift of cfg.openingHours) {
    const shiftStart = parseTimeToMinutes(shift.start);
    const shiftEnd = parseTimeToMinutes(shift.end);
    const latestStart = shiftEnd - cfg.standardDurationMin;
    const start = Math.max(shiftStart, minStartMin ?? shiftStart);

    for (let t = start; t <= latestStart; t += cfg.slotIntervalMin) {
      if (checkCapacity(restaurantId, cfg, date, t, cfg.standardDurationMin, partySize, excludeReservationId)) {
        slots.push(t);
      }
    }
  }

  slots.sort((a, b) => a - b);
  return slots;
}

function findOutOfHoursAlternatives(
  restaurantId: string,
  date: string,
  requestedMin: number,
  partySize: number,
  excludeReservationId?: string
): { date: string; time: string }[] {
  const cfg = getReservationSettings(restaurantId);
  const alternatives: { date: string; time: string }[] = [];
  const baseDate = parseISODateLocal(date);
  if (!baseDate) return alternatives;

  const sameDaySlots = getAvailableSlotsOnDate(
    restaurantId,
    date,
    partySize,
    Number.isFinite(requestedMin) ? requestedMin : undefined,
    excludeReservationId
  );

  for (const t of sameDaySlots) {
    alternatives.push({ date, time: minutesToHHMM(t) });
    if (alternatives.length >= 2) return alternatives;
  }

  for (let i = 1; i <= 7 && alternatives.length < 2; i++) {
    const next = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    next.setDate(next.getDate() + i);
    const nextDate = toISODateLocal(next);
    if (cfg.closedDates?.includes(nextDate)) continue;

    const daySlots = getAvailableSlotsOnDate(restaurantId, nextDate, partySize, undefined, excludeReservationId);
    for (const t of daySlots) {
      alternatives.push({ date: nextDate, time: minutesToHHMM(t) });
      if (alternatives.length >= 2) return alternatives;
    }
  }

  return alternatives;
}
