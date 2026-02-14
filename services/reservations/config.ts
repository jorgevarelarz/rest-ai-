import { CapacityConfig } from './types';

export const RESERVATION_CONFIG: CapacityConfig = {
  totalCapacity: 30, // Small restaurant MVP
  maxPartySize: 8,   // Reject groups larger than this automatically
  standardDurationMin: 90,
  bufferMin: 10,
  slotIntervalMin: 30,
  slotRounding: "ceil",
  openingHours: [
    { start: "13:00", end: "16:00" }, // Lunch
    { start: "20:00", end: "23:30" }  // Dinner
  ],
  closedDates: [
    "2026-01-01", // New Year
    "2026-12-25", // Christmas
    "2026-03-19"  // Father's Day (Example)
  ]
};
