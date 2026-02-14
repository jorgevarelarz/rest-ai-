import { MenuCategory, MenuItem } from "../../types";

const KEY_CATEGORIES = "resto_bot_menu_categories_v1";
const KEY_ITEMS = "resto_bot_menu_items_v1";

const generateId = () => Math.random().toString(36).slice(2, 11);

const load = <T,>(key: string): T[] => {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (key: string, data: unknown[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const MenuRepository = {
  listCategories: (restaurantId: string): MenuCategory[] => {
    return load<MenuCategory>(KEY_CATEGORIES)
      .filter((c) => c.restaurant_id === restaurantId)
      .slice()
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  },

  listItems: (restaurantId: string): MenuItem[] => {
    return load<MenuItem>(KEY_ITEMS)
      .filter((i) => i.restaurant_id === restaurantId)
      .slice()
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  },

  createCategory: (restaurantId: string, input: { name: string }): MenuCategory => {
    const name = input.name.trim();
    if (!name) throw new Error("Category name is required.");
    const db = load<MenuCategory>(KEY_CATEGORIES);
    const sort = db.filter((c) => c.restaurant_id === restaurantId).length;
    const c: MenuCategory = { id: generateId(), restaurant_id: restaurantId, name, sort };
    db.push(c);
    save(KEY_CATEGORIES, db);
    return c;
  },

  deleteCategory: (restaurantId: string, categoryId: string): boolean => {
    const cats = load<MenuCategory>(KEY_CATEGORIES);
    const before = cats.length;
    const next = cats.filter((c) => !(c.restaurant_id === restaurantId && c.id === categoryId));
    if (next.length === before) return false;
    save(KEY_CATEGORIES, next);

    // Also delete items in that category.
    const items = load<MenuItem>(KEY_ITEMS);
    const nextItems = items.filter((i) => !(i.restaurant_id === restaurantId && i.category_id === categoryId));
    save(KEY_ITEMS, nextItems);
    return true;
  },

  createItem: (
    restaurantId: string,
    input: { category_id: string; name: string; description?: string; price_eur?: number }
  ): MenuItem => {
    const name = input.name.trim();
    if (!name) throw new Error("Item name is required.");
    const items = load<MenuItem>(KEY_ITEMS);
    const sort = items.filter((i) => i.restaurant_id === restaurantId && i.category_id === input.category_id).length;
    const it: MenuItem = {
      id: generateId(),
      restaurant_id: restaurantId,
      category_id: input.category_id,
      name,
      description: input.description?.trim() || undefined,
      price_eur: input.price_eur,
      available: true,
      sort,
    };
    items.push(it);
    save(KEY_ITEMS, items);
    return it;
  },

  setItemAvailable: (restaurantId: string, itemId: string, available: boolean): MenuItem | null => {
    const items = load<MenuItem>(KEY_ITEMS);
    const idx = items.findIndex((i) => i.restaurant_id === restaurantId && i.id === itemId);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], available };
    save(KEY_ITEMS, items);
    return items[idx];
  },

  deleteItem: (restaurantId: string, itemId: string): boolean => {
    const items = load<MenuItem>(KEY_ITEMS);
    const before = items.length;
    const next = items.filter((i) => !(i.restaurant_id === restaurantId && i.id === itemId));
    if (next.length === before) return false;
    save(KEY_ITEMS, next);
    return true;
  },
};

