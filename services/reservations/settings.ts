import { CapacityConfig } from "./types";
import { RESERVATION_CONFIG } from "./config";
import { RestaurantConfigRepository } from "../restaurants/configRepository";

type Listener = () => void;
const listenersByRestaurant = new Map<string, Set<Listener>>();

const keyFor = (restaurantId: string) => `resto_bot_settings_v1:${restaurantId}`;

const loadRaw = (restaurantId: string): Partial<CapacityConfig> | null => {
  const raw = localStorage.getItem(keyFor(restaurantId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<CapacityConfig>;
  } catch {
    return null;
  }
};

const notify = (restaurantId: string) => {
  const ls = listenersByRestaurant.get(restaurantId);
  if (!ls) return;
  for (const l of ls) l();
};

const saveRaw = (restaurantId: string, data: CapacityConfig) => {
  localStorage.setItem(keyFor(restaurantId), JSON.stringify(data));
  notify(restaurantId);
};

export function getReservationSettings(restaurantId: string): CapacityConfig {
  const stored = loadRaw(restaurantId);
  const merged: CapacityConfig = {
    ...RESERVATION_CONFIG,
    ...(stored ?? {}),
    // Ensure closedDates always exists as an array for UI convenience.
    closedDates: (stored?.closedDates ?? RESERVATION_CONFIG.closedDates ?? []).slice(),
  };

  // Basic sanitization (no throwing): keep engine stable.
  if (!Number.isFinite(merged.totalCapacity) || merged.totalCapacity < 0) merged.totalCapacity = RESERVATION_CONFIG.totalCapacity;
  if (!Number.isFinite(merged.maxPartySize) || merged.maxPartySize < 1) merged.maxPartySize = RESERVATION_CONFIG.maxPartySize;
  if (!Number.isFinite(merged.standardDurationMin) || merged.standardDurationMin < 1) merged.standardDurationMin = RESERVATION_CONFIG.standardDurationMin;
  if (!Number.isFinite(merged.bufferMin) || merged.bufferMin < 0) merged.bufferMin = RESERVATION_CONFIG.bufferMin;
  if (!Number.isFinite(merged.slotIntervalMin) || merged.slotIntervalMin < 1) merged.slotIntervalMin = RESERVATION_CONFIG.slotIntervalMin;
  if (merged.slotRounding !== "ceil" && merged.slotRounding !== "floor" && merged.slotRounding !== "nearest") {
    merged.slotRounding = RESERVATION_CONFIG.slotRounding;
  }

  return merged;
}

export function updateReservationSettings(restaurantId: string, patch: Partial<CapacityConfig>): CapacityConfig {
  const next: CapacityConfig = { ...getReservationSettings(restaurantId), ...patch };
  saveRaw(restaurantId, next);

  // Keep RestaurantConfig fields in sync for prompt/UI.
  RestaurantConfigRepository.patch(restaurantId, {
    slot_interval_min: next.slotIntervalMin,
    slot_rounding: next.slotRounding,
  });

  return next;
}

export function subscribeReservationSettings(restaurantId: string, listener: Listener): () => void {
  const set = listenersByRestaurant.get(restaurantId) ?? new Set<Listener>();
  set.add(listener);
  listenersByRestaurant.set(restaurantId, set);
  return () => {
    const s = listenersByRestaurant.get(restaurantId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) listenersByRestaurant.delete(restaurantId);
  };
}
