import { Restaurant } from "../../types";
import { migrateRestaurantIdsIfNeeded } from "./migration";
import { ensureUniqueSlug, isValidSlug, slugify } from "./slug";
import { generateUuid, isUuid } from "./uuid";

const STORAGE_KEY = "resto_bot_restaurants_v1";
const ACTIVE_RESTAURANT_KEY = "resto_bot_active_restaurant";
const DEFAULT_RESTAURANT_ID_KEY = "resto_bot_default_restaurant_id";

const loadDB = (): Restaurant[] => {
  migrateRestaurantIdsIfNeeded();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Restaurant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveDB = (data: Restaurant[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

function normalizeRestaurants(db: Restaurant[]): Restaurant[] {
  const nowIso = new Date().toISOString();
  const usedSlugs = new Set<string>();
  const out: Restaurant[] = [];

  for (const r of db) {
    const id = isUuid(r.id) ? r.id : generateUuid();
    const name = (r.name || "").trim() || "Restaurant";
    const wa = (r.whatsapp_number_e164 || "").trim();
    const status = r.status === "disabled" ? "disabled" : "active";
    const created_at = (r.created_at || "").trim() || nowIso;

    let slug = (r.slug || "").trim().toLowerCase();
    if (!slug) slug = slugify(name);
    if (!isValidSlug(slug)) slug = slugify(slug);
    slug = ensureUniqueSlug(slug, usedSlugs);
    usedSlugs.add(slug);

    out.push({
      id,
      slug,
      name,
      whatsapp_number_e164: wa,
      status,
      created_at,
    });
  }

  return out;
}

export const RestaurantRepository = {
  ensureDefaultRestaurant: (): Restaurant => {
    const db0 = loadDB();
    const db = normalizeRestaurants(db0);

    // If we normalized, persist.
    if (JSON.stringify(db) !== JSON.stringify(db0)) saveDB(db);

    const defaultId = localStorage.getItem(DEFAULT_RESTAURANT_ID_KEY);
    if (defaultId) {
      const found = db.find((r) => r.id === defaultId);
      if (found) return found;
    }

    if (db.length > 0) {
      localStorage.setItem(DEFAULT_RESTAURANT_ID_KEY, db[0].id);
      return db[0];
    }

    const r: Restaurant = {
      id: generateUuid(),
      slug: "resto-default",
      name: "La Trattoria del Gusto",
      whatsapp_number_e164: "+34912345678",
      status: "active",
      created_at: new Date().toISOString(),
    };
    saveDB([r]);
    localStorage.setItem(DEFAULT_RESTAURANT_ID_KEY, r.id);

    // Also set as active restaurant if not set.
    if (!localStorage.getItem(ACTIVE_RESTAURANT_KEY)) {
      localStorage.setItem(ACTIVE_RESTAURANT_KEY, r.id);
    }

    return r;
  },

  listRestaurants: (): Restaurant[] => {
    const db0 = loadDB();
    const db = normalizeRestaurants(db0);
    if (JSON.stringify(db) !== JSON.stringify(db0)) saveDB(db);
    return db.slice().sort((a, b) => a.name.localeCompare(b.name));
  },

  getById: (id: string): Restaurant | undefined => {
    return RestaurantRepository.listRestaurants().find((r) => r.id === id);
  },

  getBySlug: (slug: string): Restaurant | undefined => {
    const s = slug.trim().toLowerCase();
    return RestaurantRepository.listRestaurants().find((r) => r.slug === s);
  },

  getByWhatsappNumber: (toNumber: string): Restaurant | undefined => {
    const normalized = toNumber.trim();
    return RestaurantRepository.listRestaurants().find((r) => r.whatsapp_number_e164 === normalized);
  },

  createRestaurant: (input: { name: string; whatsapp_number_e164: string }): Restaurant => {
    const name = input.name.trim();
    const wa = input.whatsapp_number_e164.trim();
    if (!name) throw new Error("Restaurant name is required.");
    if (!wa) throw new Error("whatsapp_number_e164 is required.");

    const db = RestaurantRepository.listRestaurants();
    if (db.some((r) => r.whatsapp_number_e164 === wa)) {
      throw new Error("whatsapp_number_e164 must be unique.");
    }

    const usedSlugs = new Set(db.map((r) => r.slug));
    const slug = ensureUniqueSlug(slugify(name), usedSlugs);

    const r: Restaurant = {
      id: generateUuid(),
      slug,
      name,
      whatsapp_number_e164: wa,
      status: "active",
      created_at: new Date().toISOString(),
    };

    db.push(r);
    saveDB(db);
    return r;
  },

  updateRestaurant: (
    id: string,
    patch: Partial<Pick<Restaurant, "name" | "slug" | "whatsapp_number_e164" | "status">>
  ): Restaurant | null => {
    const db = RestaurantRepository.listRestaurants();
    const idx = db.findIndex((r) => r.id === id);
    if (idx === -1) return null;

    if (patch.whatsapp_number_e164 !== undefined) {
      const wa = patch.whatsapp_number_e164.trim();
      if (!wa) throw new Error("whatsapp_number_e164 is required.");
      const clash = db.some((r) => r.id !== id && r.whatsapp_number_e164 === wa);
      if (clash) throw new Error("whatsapp_number_e164 must be unique.");
      patch.whatsapp_number_e164 = wa;
    }

    if (patch.slug !== undefined) {
      const s = patch.slug.trim().toLowerCase();
      if (!s) throw new Error("slug is required.");
      if (!isValidSlug(s)) throw new Error("slug must match /^[a-z0-9]+(-[a-z0-9]+)*$/");
      const clash = db.some((r) => r.id !== id && r.slug === s);
      if (clash) throw new Error("slug must be unique.");
      patch.slug = s;
    }

    if (patch.name !== undefined) {
      const n = patch.name.trim();
      if (!n) throw new Error("name is required.");
      patch.name = n;
    }

    const next = { ...db[idx], ...patch };
    db[idx] = next;
    saveDB(db);
    return next;
  },
};

