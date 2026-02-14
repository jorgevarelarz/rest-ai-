import { isUuid, generateUuid } from "./uuid";

const RESTAURANTS_KEY = "resto_bot_restaurants_v1";
const CONFIGS_KEY = "resto_bot_restaurant_configs_v1";
const RESERVATIONS_KEY = "resto_bot_reservations";
const MENU_CATEGORIES_KEY = "resto_bot_menu_categories_v1";
const MENU_ITEMS_KEY = "resto_bot_menu_items_v1";

const ACTIVE_RESTAURANT_KEY = "resto_bot_active_restaurant";
const DEFAULT_RESTAURANT_ID_KEY = "resto_bot_default_restaurant_id";

const SETTINGS_PREFIX = "resto_bot_settings_v1:";

type AnyObj = Record<string, any>;

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function migrateRestaurantIdsIfNeeded(): void {
  const restaurants = readJson<AnyObj[]>(RESTAURANTS_KEY, []);
  if (!Array.isArray(restaurants) || restaurants.length === 0) return;

  const idMap: Record<string, string> = {};
  for (const r of restaurants) {
    const oldId = String(r.id ?? "");
    if (!oldId) continue;
    if (!isUuid(oldId)) {
      const nextId = generateUuid();
      idMap[oldId] = nextId;
      r.id = nextId;
    }
  }

  if (Object.keys(idMap).length === 0) return;

  // Update restaurant_configs map keys + embedded restaurant_id.
  const cfgs = readJson<Record<string, AnyObj>>(CONFIGS_KEY, {});
  const nextCfgs: Record<string, AnyObj> = {};
  for (const [rid, cfg] of Object.entries(cfgs)) {
    const nextRid = idMap[rid] ?? rid;
    const nextCfg = { ...cfg, restaurant_id: nextRid };
    nextCfgs[nextRid] = nextCfg;
  }
  writeJson(CONFIGS_KEY, nextCfgs);

  // Update reservations restaurant_id.
  const reservations = readJson<AnyObj[]>(RESERVATIONS_KEY, []);
  let resChanged = false;
  for (const r of reservations) {
    const rid = r.restaurant_id;
    if (rid && idMap[rid]) {
      r.restaurant_id = idMap[rid];
      resChanged = true;
    }
  }
  if (resChanged) writeJson(RESERVATIONS_KEY, reservations);

  // Update menu restaurant_id.
  const cats = readJson<AnyObj[]>(MENU_CATEGORIES_KEY, []);
  let catsChanged = false;
  for (const c of cats) {
    const rid = c.restaurant_id;
    if (rid && idMap[rid]) {
      c.restaurant_id = idMap[rid];
      catsChanged = true;
    }
  }
  if (catsChanged) writeJson(MENU_CATEGORIES_KEY, cats);

  const items = readJson<AnyObj[]>(MENU_ITEMS_KEY, []);
  let itemsChanged = false;
  for (const it of items) {
    const rid = it.restaurant_id;
    if (rid && idMap[rid]) {
      it.restaurant_id = idMap[rid];
      itemsChanged = true;
    }
  }
  if (itemsChanged) writeJson(MENU_ITEMS_KEY, items);

  // Migrate per-restaurant settings keys (copy old -> new, then remove old).
  for (const [oldId, newId] of Object.entries(idMap)) {
    const oldKey = `${SETTINGS_PREFIX}${oldId}`;
    const raw = localStorage.getItem(oldKey);
    if (raw) {
      localStorage.setItem(`${SETTINGS_PREFIX}${newId}`, raw);
      localStorage.removeItem(oldKey);
    }
  }

  // Active/default restaurant pointers.
  const active = localStorage.getItem(ACTIVE_RESTAURANT_KEY);
  if (active && idMap[active]) localStorage.setItem(ACTIVE_RESTAURANT_KEY, idMap[active]);
  const def = localStorage.getItem(DEFAULT_RESTAURANT_ID_KEY);
  if (def && idMap[def]) localStorage.setItem(DEFAULT_RESTAURANT_ID_KEY, idMap[def]);

  // Persist restaurants with new UUIDs.
  writeJson(RESTAURANTS_KEY, restaurants);
}

