import React, { useMemo, useState } from "react";
import { MenuRepository } from "../../services/menu/repository";
import { MenuCategory, MenuItem } from "../../types";

interface MenuManagerProps {
  restaurantId: string;
  refreshKey: number;
}

type ImportMenuJson = {
  categories?: { name: string; sort?: number }[];
  items?: {
    category?: string;
    category_id?: string;
    name: string;
    description?: string;
    price_eur?: number;
    available?: boolean;
    sort?: number;
  }[];
};

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const sample = lines[0];
  const comma = (sample.match(/,/g) || []).length;
  const semi = (sample.match(/;/g) || []).length;
  const sep = semi > comma ? ";" : ",";

  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(sep).map((c) => c.trim());
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";
    return row;
  });
}

const MenuManager: React.FC<MenuManagerProps> = ({ restaurantId, refreshKey }) => {
  const [localTick, setLocalTick] = useState(0);
  const [newCategory, setNewCategory] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");

  const categories = useMemo(() => {
    void refreshKey;
    void localTick;
    return MenuRepository.listCategories(restaurantId);
  }, [restaurantId, refreshKey, localTick]);

  const items = useMemo(() => {
    void refreshKey;
    void localTick;
    return MenuRepository.listItems(restaurantId);
  }, [restaurantId, refreshKey, localTick]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const it of items) {
      const list = map.get(it.category_id) ?? [];
      list.push(it);
      map.set(it.category_id, list);
    }
    return map;
  }, [items]);

  const createCategory = () => {
    try {
      setError(null);
      const c = MenuRepository.createCategory(restaurantId, { name: newCategory });
      setNewCategory("");
      setSelectedCategoryId(c.id);
      setLocalTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create category.");
    }
  };

  const createItem = () => {
    try {
      setError(null);
      if (!selectedCategoryId) {
        setError("Selecciona una categoría.");
        return;
      }
      const price = newItemPrice.trim() ? Number(newItemPrice) : undefined;
      if (newItemPrice.trim() && !Number.isFinite(price)) {
        setError("Precio inválido.");
        return;
      }
      MenuRepository.createItem(restaurantId, {
        category_id: selectedCategoryId,
        name: newItemName,
        description: newItemDesc || undefined,
        price_eur: price,
      });
      setNewItemName("");
      setNewItemDesc("");
      setNewItemPrice("");
      setLocalTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item.");
    }
  };

  const importMenu = (payload: ImportMenuJson) => {
    const existingCats = MenuRepository.listCategories(restaurantId);
    const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));

    for (const c of payload.categories ?? []) {
      const name = (c.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!catByName.has(key)) {
        const created = MenuRepository.createCategory(restaurantId, { name });
        catByName.set(key, created);
      }
    }

    for (const it of payload.items ?? []) {
      const name = (it.name || "").trim();
      if (!name) continue;
      let categoryId = it.category_id?.trim() || "";
      if (!categoryId && it.category) {
        const key = it.category.trim().toLowerCase();
        const cat = catByName.get(key) ?? MenuRepository.createCategory(restaurantId, { name: it.category.trim() });
        catByName.set(key, cat);
        categoryId = cat.id;
      }
      if (!categoryId) continue;

      const created = MenuRepository.createItem(restaurantId, {
        category_id: categoryId,
        name,
        description: it.description,
        price_eur: typeof it.price_eur === "number" ? it.price_eur : undefined,
      });
      if (it.available === false) {
        MenuRepository.setItemAvailable(restaurantId, created.id, false);
      }
    }
  };

  const importFromText = () => {
    try {
      setError(null);
      const raw = importText.trim();
      if (!raw) return;

      if (raw.startsWith("{") || raw.startsWith("[")) {
        const parsed = JSON.parse(raw) as ImportMenuJson | ImportMenuJson[];
        if (Array.isArray(parsed)) {
          importMenu({ items: parsed as any });
        } else {
          importMenu(parsed);
        }
      } else {
        // CSV: headers: category,name,description,price_eur,available
        const rows = parseCsv(raw);
        const items = rows.map((r) => ({
          category: r["category"] || r["categoria"] || r["cat"] || "",
          name: r["name"] || r["nombre"] || "",
          description: r["description"] || r["descripcion"] || "",
          price_eur: r["price_eur"] ? Number(r["price_eur"]) : r["precio"] ? Number(r["precio"]) : undefined,
          available: r["available"] ? r["available"].toLowerCase() !== "false" : undefined,
        }));
        importMenu({ items });
      }

      setImportText("");
      setLocalTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    }
  };

  const deleteCategory = (c: MenuCategory) => {
    MenuRepository.deleteCategory(restaurantId, c.id);
    setLocalTick((t) => t + 1);
  };

  const deleteItem = (it: MenuItem) => {
    MenuRepository.deleteItem(restaurantId, it.id);
    setLocalTick((t) => t + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Carta (MVP)</h3>
        <div className="text-xs text-gray-500">
          {categories.length} categorías · {items.length} items
        </div>
      </div>

      <div className="border border-gray-200 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-700">Subir carta (JSON o CSV)</div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={`JSON ejemplo:\n{\n  \"categories\": [{\"name\": \"Entrantes\"}],\n  \"items\": [{\"category\": \"Entrantes\", \"name\": \"Croquetas\", \"price_eur\": 12.5}]\n}\n\nCSV headers:\ncategory,name,description,price_eur,available`}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-xs font-mono h-40"
        />
        <button
          onClick={importFromText}
          className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
        >
          Importar
        </button>
      </div>

      <div className="border border-gray-200 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-700">Nueva categoría</div>
        <div className="flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Ej: Entrantes"
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={createCategory}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
          >
            Añadir
          </button>
        </div>
      </div>

      <div className="border border-gray-200 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-700">Nuevo item</div>
        <div className="grid grid-cols-1 gap-2">
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Selecciona categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Nombre"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={newItemDesc}
            onChange={(e) => setNewItemDesc(e.target.value)}
            placeholder="Descripción (opcional)"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={newItemPrice}
            onChange={(e) => setNewItemPrice(e.target.value)}
            placeholder="Precio EUR (opcional)"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={createItem}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
          >
            Añadir item
          </button>
          {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="text-sm text-gray-500 italic border border-dashed border-gray-200 rounded-md p-4">
          Aún no hay carta.
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => {
            const list = itemsByCategory.get(c.id) ?? [];
            return (
              <div key={c.id} className="border border-gray-200 rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-gray-900 truncate">{c.name}</div>
                  <button
                    onClick={() => deleteCategory(c)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-200 hover:bg-gray-50"
                    title="Borra categoría y sus items"
                  >
                    Borrar
                  </button>
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-gray-500 italic mt-2">Sin items.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {list.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 border border-gray-100 rounded-md p-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {it.name}{" "}
                            {typeof it.price_eur === "number" ? (
                              <span className="text-xs text-gray-500 font-normal">· {it.price_eur.toFixed(2)} EUR</span>
                            ) : null}
                          </div>
                          {it.description ? <div className="text-xs text-gray-600 mt-0.5">{it.description}</div> : null}
                          <div className="text-xs mt-1">
                            <span className={`font-semibold ${it.available ? "text-green-700" : "text-gray-500"}`}>
                              {it.available ? "available" : "unavailable"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => {
                              MenuRepository.setItemAvailable(restaurantId, it.id, !it.available);
                              setLocalTick((t) => t + 1);
                            }}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-200 hover:bg-gray-50"
                          >
                            {it.available ? "Ocultar" : "Mostrar"}
                          </button>
                          <button
                            onClick={() => deleteItem(it)}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-200 hover:bg-gray-50"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MenuManager;
