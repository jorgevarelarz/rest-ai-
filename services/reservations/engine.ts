import { BackendAction, ReservationData } from '../../types';
import { AvailabilityService } from './availability';
import { ReservationRepository } from './repository';
import { Reservation, AvailabilityReason } from './types';
import { getReservationSettings } from "./settings";
import { minutesToHHMM, parseTimeToMinutes, roundToSlot } from "./timeSlots";

export interface ReservationEngineContext {
  restaurant_id: string;
  phone: string;
  now?: Date;
}

export interface EngineResponse {
  success: boolean;
  data?: any;
  availability?: 'available' | 'not_available' | 'unknown';
  reason?: AvailabilityReason;
  alternatives?: { date: string; time: string }[];
  normalized_time?: string;
  message?: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toLocalISODate = (d: Date): string => {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const addDaysLocal = (d: Date, days: number): Date => {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

const isValidISODate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [yy, mm, dd] = date.split('-').map(Number);
  const dt = new Date(yy, mm - 1, dd);
  return dt.getFullYear() === yy && dt.getMonth() === mm - 1 && dt.getDate() === dd;
};

const normalizeDateInput = (value: string, now: Date): string | null => {
  const raw = value.trim();
  if (!raw) return null;

  if (isValidISODate(raw)) return raw;

  const normalized = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (normalized === "hoy" || normalized === "today") return toLocalISODate(now);
  if (normalized === "manana" || normalized === "tomorrow") return toLocalISODate(addDaysLocal(now, 1));
  if (normalized === "pasado manana" || normalized === "day after tomorrow") return toLocalISODate(addDaysLocal(now, 2));

  const dmY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (!dmY) return null;

  const day = Number(dmY[1]);
  const month = Number(dmY[2]);
  let year = dmY[3] ? Number(dmY[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  const candidate = `${year}-${pad2(month)}-${pad2(day)}`;
  return isValidISODate(candidate) ? candidate : null;
};

export const ReservationEngine = {
  execute: (action: BackendAction, ctx: ReservationEngineContext): EngineResponse => {
    const restaurantId = ctx.restaurant_id;
    const userPhone = ctx.phone;
    const now = ctx.now ?? new Date();
    switch (action.type) {
      case 'check_availability': {
        const { date, time, party_size } = action.payload;
        if (!date || !time || !party_size) return { success: false, availability: 'unknown' };
        const normalizedDate = normalizeDateInput(date, now);
        if (!normalizedDate) return { success: false, availability: 'unknown', message: 'Invalid date format.' };

        const result = AvailabilityService.check(restaurantId, normalizedDate, time, party_size);
        
        return {
          success: true,
          availability: result.status === 'available' ? 'available' : 'not_available',
          reason: result.reason ?? null,
          alternatives: result.alternatives,
          normalized_time: result.normalized_time
        };
      }

      case 'create_reservation': {
        const { date, time, party_size, name, notes, phone, table_id } = action.payload;
        if (!date || !time || !party_size || !name) {
          return { success: false, availability: "unknown", message: "Missing required reservation fields." };
        }
        const normalizedDate = normalizeDateInput(date, now);
        if (!normalizedDate) {
          return { success: false, availability: "unknown", message: "Invalid date format." };
        }
        // Use payload phone if provided (bot extracted it), else use context phone
        const finalPhone = phone || userPhone;

        const cfg = getReservationSettings(restaurantId);
        const rawMin = parseTimeToMinutes(time);
        if (!Number.isFinite(rawMin)) {
          return { success: false, availability: "unknown", message: "Invalid time format." };
        }
        const roundedMin = roundToSlot(rawMin, cfg.slotIntervalMin, cfg.slotRounding);
        if (!Number.isFinite(roundedMin)) {
          return { success: false, availability: "unknown", message: "Invalid normalized time." };
        }
        const normalizedTime = minutesToHHMM(roundedMin);

        // Double check availability before writing
        const check = AvailabilityService.check(restaurantId, normalizedDate, normalizedTime, party_size);
        if (check.status !== 'available') {
           return { 
             success: false, 
             availability: 'not_available',
             reason: check.reason ?? null,
             alternatives: check.alternatives,
             normalized_time: check.normalized_time,
             message: "Availability changed during booking." 
           };
        }

        const newRes = ReservationRepository.create(restaurantId, {
          date: normalizedDate,
          time: normalizedTime,
          partySize: party_size,
          name,
          phone: finalPhone,
          table_id,
          notes
        });

        return { success: true, data: newRes, availability: 'available', normalized_time: check.normalized_time };
      }

      case 'update_reservation': {
        const { reservation_id, changes } = action.payload;
        if (!reservation_id) return { success: false, message: "Reservation id missing" };
        
        // If we are changing time/date/size, we must check availability first
        const currentRes = ReservationRepository.getById(restaurantId, reservation_id);
        if (!currentRes) return { success: false, message: "Reservation not found" };

        const normalizedChangeDate = changes.date ? normalizeDateInput(changes.date, now) : currentRes.date;
        if (!normalizedChangeDate) return { success: false, message: "Invalid date format" };
        const newDate = normalizedChangeDate;
        const newTime = changes.time || currentRes.time;
        const newSize = changes.party_size || currentRes.partySize;

        const cfg = getReservationSettings(restaurantId);
        const rawMin = parseTimeToMinutes(newTime);
        if (!Number.isFinite(rawMin)) {
          return { success: false, message: "Invalid time format" };
        }
        const roundedMin = roundToSlot(rawMin, cfg.slotIntervalMin, cfg.slotRounding);
        if (!Number.isFinite(roundedMin)) {
          return { success: false, message: "Invalid normalized time" };
        }
        const normalizedTime = minutesToHHMM(roundedMin);

        const needsCheck = (newDate !== currentRes.date) || (newTime !== currentRes.time) || (newSize !== currentRes.partySize);

        if (needsCheck) {
           // Exclude the current reservation to avoid double counting on tight capacity.
           const check = AvailabilityService.check(restaurantId, newDate, normalizedTime, newSize, reservation_id);
           
           if (check.status !== 'available') {
              return {
                success: false,
                availability: 'not_available',
                reason: check.reason ?? null,
                alternatives: check.alternatives,
                normalized_time: check.normalized_time
              };
           }
        }

        const updated = ReservationRepository.update(restaurantId, reservation_id, {
          date: newDate,
          time: normalizedTime,
          partySize: newSize,
          table_id: changes.table_id,
          notes: changes.notes
        });

        return { success: true, data: updated };
      }

      case 'cancel_reservation': {
        const { reservation_id } = action.payload;
        const result = ReservationRepository.cancel(restaurantId, reservation_id);
        return { success: result };
      }

      case 'none':
      default:
        return { success: true };
    }
  },

  // Helper for Context
  getStats: (restaurantId: string, phone: string, now: Date = new Date()) => {
    const active = ReservationRepository.getByPhone(restaurantId, phone, now);
    return {
      count: active.length,
      hasActive: active.length > 0,
      reservations: active
    };
  }
};
