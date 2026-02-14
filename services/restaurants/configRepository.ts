import { DEFAULT_CONFIG } from "../../constants";
import { RestaurantConfig } from "../../types";

const STORAGE_KEY = "resto_bot_restaurant_configs_v1";

type ConfigMap = Record<string, RestaurantConfig>;

const loadMap = (): ConfigMap => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ConfigMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveMap = (m: ConfigMap) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
};

export const RestaurantConfigRepository = {
  get: (restaurantId: string): RestaurantConfig => {
    const map = loadMap();
    const found = map[restaurantId];
    if (found) return found;

    // Create a minimal default config for this restaurant.
    const created: RestaurantConfig = {
      ...DEFAULT_CONFIG,
      restaurant_id: restaurantId,
    };
    map[restaurantId] = created;
    saveMap(map);
    return created;
  },

  upsert: (cfg: RestaurantConfig) => {
    const map = loadMap();
    map[cfg.restaurant_id] = cfg;
    saveMap(map);
  },

  patch: (restaurantId: string, patch: Partial<Omit<RestaurantConfig, "restaurant_id">>) => {
    const current = RestaurantConfigRepository.get(restaurantId);
    RestaurantConfigRepository.upsert({ ...current, ...patch, restaurant_id: restaurantId });
  },
};

