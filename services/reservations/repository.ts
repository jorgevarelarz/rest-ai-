import { Reservation, ReservationStatus } from './types';

const STORAGE_KEY = 'resto_bot_reservations';
const DEFAULT_RESTAURANT_ID_KEY = "resto_bot_default_restaurant_id";

type Listener = () => void;
const listeners = new Set<Listener>();

// Helper to generate ID
const generateId = () => Math.random().toString(36).substr(2, 9);

const loadDB = (): Reservation[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as Reservation[];
  // Lightweight migration: older records may not have restaurant_id.
  let migrated = false;
  const defaultRestaurantId =
    localStorage.getItem(DEFAULT_RESTAURANT_ID_KEY) ||
    (() => {
      try {
        const rs = JSON.parse(localStorage.getItem("resto_bot_restaurants_v1") || "[]") as any[];
        return rs?.[0]?.id || "unknown_restaurant";
      } catch {
        return "unknown_restaurant";
      }
    })();
  for (const r of parsed) {
    if (!(r as any).restaurant_id) {
      (r as any).restaurant_id = defaultRestaurantId;
      migrated = true;
    }
  }
  if (migrated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  }
  return parsed;
};

const saveDB = (data: Reservation[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  for (const l of listeners) l();
};

export const ReservationRepository = {
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getAll: (restaurantId: string): Reservation[] => {
    return loadDB().filter(r => r.restaurant_id === restaurantId);
  },

  getByPhone: (restaurantId: string, phone: string, now: Date = new Date()): Reservation[] => {
    const db = loadDB();
    const nowMs = now.getTime();
    return db
      .filter(r => r.restaurant_id === restaurantId && r.phone === phone && r.status === 'active')
      .filter(r => {
        const t = new Date(`${r.date}T${r.time}`).getTime();
        return Number.isFinite(t) && t >= nowMs;
      })
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });
  },

  getById: (restaurantId: string, id: string): Reservation | undefined => {
    return loadDB().find(r => r.restaurant_id === restaurantId && r.id === id);
  },

  // Active only
  listByDate: (restaurantId: string, date: string): Reservation[] => {
    return loadDB().filter(r => r.restaurant_id === restaurantId && r.date === date && r.status === 'active');
  },

  // All statuses
  listByDateAll: (restaurantId: string, date: string): Reservation[] => {
    return loadDB().filter(r => r.restaurant_id === restaurantId && r.date === date);
  },

  // Back-compat aliases (older code paths)
  getByDate: (restaurantId: string, date: string): Reservation[] => {
    return ReservationRepository.listByDate(restaurantId, date);
  },
  getByDateAll: (restaurantId: string, date: string): Reservation[] => {
    return ReservationRepository.listByDateAll(restaurantId, date);
  },

  create: (restaurantId: string, data: Omit<Reservation, 'id' | 'createdAt' | 'status' | 'restaurant_id'>): Reservation => {
    const db = loadDB();
    const newRes: Reservation = {
      ...data,
      restaurant_id: restaurantId,
      id: generateId(),
      status: 'active',
      createdAt: Date.now()
    };
    db.push(newRes);
    saveDB(db);
    return newRes;
  },

  update: (restaurantId: string, id: string, updates: Partial<Omit<Reservation, 'id' | 'createdAt' | 'restaurant_id'>>): Reservation | null => {
    const db = loadDB();
    const idx = db.findIndex(r => r.restaurant_id === restaurantId && r.id === id);
    if (idx === -1) return null;

    db[idx] = { ...db[idx], ...updates };
    saveDB(db);
    return db[idx];
  },

  cancel: (restaurantId: string, id: string): boolean => {
    const db = loadDB();
    const idx = db.findIndex(r => r.restaurant_id === restaurantId && r.id === id);
    if (idx === -1) return false;

    db[idx].status = 'cancelled';
    saveDB(db);
    return true;
  }
};
