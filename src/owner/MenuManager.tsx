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
    allergens?: string[];
    alergenos?: string[];
    available?: boolean;
    sort?: number;
  }[];
};

const ALLERGEN_OPTIONS = [
  "gluten",
  "lactosa",
  "huevo",
  "frutos secos",
  "cacahuete",
  "soja",
  "pescado",
  "marisco",
  "mostaza",
  "sesamo",
  "apio",
  "sulfitos",
  "altramuz",
  "moluscos",
] as const;

function parseAllergenList(raw: string): string[] {
  return raw
    .split(/[|;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

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
  const [showImport, setShowImport] = useState(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);

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
      if (!newCategory.trim()) {
        setError("Escribe un nombre de categoría.");
        return;
      }
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
      if (!newItemName.trim()) {
        setError("El nombre del plato es obligatorio.");
        return;
      }
      const normalizedPrice = newItemPrice.trim().replace(",", ".");
      const price = normalizedPrice ? Number(normalizedPrice) : undefined;
      if (newItemPrice.trim() && !Number.isFinite(price)) {
        setError("Precio inválido.");
        return;
      }
      MenuRepository.createItem(restaurantId, {
        category_id: selectedCategoryId,
        name: newItemName,
        description: newItemDesc || undefined,
        price_eur: price,
        allergens: selectedAllergens,
      });
      setNewItemName("");
      setNewItemDesc("");
      setNewItemPrice("");
      setSelectedAllergens([]);
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
        allergens: (it.allergens ?? it.alergenos ?? []).map((a) => String(a).trim().toLowerCase()).filter(Boolean),
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
          allergens: r["allergens"]
            ? parseAllergenList(r["allergens"])
            : r["alergenos"]
            ? parseAllergenList(r["alergenos"])
            : [],
          available: r["available"] ? r["available"].toLowerCase() !== "false" : undefined,
        }));
        importMenu({ items });
      }

      setImportText("");
      setShowImport(false);
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Carta</h3>
        <div className="text-xs text-slate-500">
          {categories.length} categorías · {items.length} items
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Alta rápida</h4>
          <p className="text-xs text-slate-500">Crea categorías y platos sin usar importaciones técnicas.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Nueva categoría (ej: Entrantes)"
            className="sm:col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={createCategory}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
          >
            Crear categoría
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Selecciona categoría del plato</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Nombre del plato"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={newItemDesc}
            onChange={(e) => setNewItemDesc(e.target.value)}
            placeholder="Descripción corta (opcional)"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <input
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="Precio EUR, ej: 12.50"
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={createItem}
              className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100 whitespace-nowrap"
            >
              Añadir plato
            </button>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <div className="text-xs font-semibold text-slate-700">Alérgenos del plato</div>
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_OPTIONS.map((a) => {
                const checked = selectedAllergens.includes(a);
                return (
                  <label
                    key={a}
                    className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer ${
                      checked
                        ? "bg-amber-100 border-amber-300 text-amber-900"
                        : "bg-white border-slate-300 text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedAllergens((prev) =>
                          e.target.checked ? Array.from(new Set([...prev, a])) : prev.filter((x) => x !== a)
                        );
                      }}
                    />
                    {a}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <button
          onClick={() => setShowImport((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-bold text-slate-900">Importación avanzada (JSON/CSV)</span>
          <span className="text-xs text-slate-500">{showImport ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showImport ? (
          <>
            <p className="text-xs text-slate-500">Usa esta opción solo si ya tienes la carta en formato JSON o CSV.</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`JSON ejemplo:\n{\n  \"categories\": [{\"name\": \"Entrantes\"}],\n  \"items\": [{\"category\": \"Entrantes\", \"name\": \"Croquetas\", \"price_eur\": 12.5, \"allergens\": [\"gluten\",\"lactosa\"]}]\n}\n\nCSV headers:\ncategory,name,description,price_eur,allergens,available`}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs font-mono h-40"
            />
            <button
              onClick={importFromText}
              className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
            >
              Importar carta
            </button>
          </>
        ) : null}
      </section>

      {categories.length === 0 ? (
        <div className="text-sm text-slate-500 italic border border-dashed border-slate-300 rounded-md p-4">
          Aún no hay carta.
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => {
            const list = itemsByCategory.get(c.id) ?? [];
            const missingAllergenCount = list.filter((it) => (it.allergens ?? []).length === 0).length;
            return (
              <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {c.name} <span className="text-xs text-slate-500 font-normal">({list.length})</span>
                    </div>
                    {missingAllergenCount > 0 ? (
                      <div className="mt-1 text-[11px] text-amber-700">
                        {missingAllergenCount} plato(s) con alérgenos pendientes
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-emerald-700">Alérgenos completos</div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCategory(c)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 hover:bg-slate-100"
                    title="Borra categoría y sus items"
                  >
                    Borrar
                  </button>
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-slate-500 italic mt-2">Sin platos todavía.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {list.map((it) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 border border-slate-200 rounded-md p-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {it.name}{" "}
                            {typeof it.price_eur === "number" ? (
                              <span className="text-xs text-slate-500 font-normal">· {it.price_eur.toFixed(2)} EUR</span>
                            ) : null}
                          </div>
                          {it.description ? <div className="text-xs text-slate-600 mt-0.5">{it.description}</div> : null}
                          {(it.allergens ?? []).length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(it.allergens ?? []).map((a) => (
                                <span key={`${it.id}-${a}`} className="px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                                  {a}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                Ficha de alérgenos pendiente
                              </span>
                            </div>
                          )}
                          <div className="text-xs mt-1">
                            <span className={`font-semibold ${it.available ? "text-emerald-700" : "text-slate-500"}`}>
                              {it.available ? "visible" : "oculto"}
                            </span>
                          </div>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-slate-600">Editar alérgenos</summary>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {ALLERGEN_OPTIONS.map((a) => {
                                const checked = (it.allergens ?? []).includes(a);
                                return (
                                  <label
                                    key={`${it.id}-edit-${a}`}
                                    className={`px-2 py-0.5 rounded-full text-[11px] border cursor-pointer ${
                                      checked
                                        ? "bg-amber-100 border-amber-300 text-amber-900"
                                        : "bg-white border-slate-300 text-slate-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="sr-only"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? Array.from(new Set([...(it.allergens ?? []), a]))
                                          : (it.allergens ?? []).filter((x) => x !== a);
                                        MenuRepository.updateItem(restaurantId, it.id, { allergens: next });
                                        setLocalTick((t) => t + 1);
                                      }}
                                    />
                                    {a}
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => {
                              MenuRepository.setItemAvailable(restaurantId, it.id, !it.available);
                              setLocalTick((t) => t + 1);
                            }}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 hover:bg-slate-100"
                          >
                            {it.available ? "Ocultar" : "Mostrar"}
                          </button>
                          <button
                            onClick={() => deleteItem(it)}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 hover:bg-slate-100"
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
