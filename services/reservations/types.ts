export type ReservationStatus = 'active' | 'cancelled';

export interface Reservation {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string; // The primary identifier
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  notes?: string;
  status: ReservationStatus;
  createdAt: number;
}

export interface TimeSlot {
  time: string; // HH:MM
  available: boolean;
}

export type AvailabilityReason = 'capacity' | 'max_party' | 'out_of_hours' | 'turn_end' | 'closed' | null;

export interface AvailabilityResult {
  status: 'available' | 'not_available';
  reason?: AvailabilityReason;
  alternatives: { date: string; time: string }[];
  // If the requested time was normalized to a slot (e.g. "21:47" -> "22:00").
  normalized_time?: string;
}

export type SlotRoundingMode = "nearest" | "floor" | "ceil";

export interface CapacityConfig {
  totalCapacity: number; // Total people
  maxPartySize: number; // Max people per single reservation
  standardDurationMin: number; // 90 min
  bufferMin: number; // 10 min
  slotIntervalMin: number; // 30 min
  slotRounding: SlotRoundingMode;
  openingHours: {
    start: string; // "13:00"
    end: string;   // "16:00"
  }[];
  closedDates?: string[]; // "YYYY-MM-DD"
}
