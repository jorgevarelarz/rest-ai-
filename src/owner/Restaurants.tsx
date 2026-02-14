import React, { useMemo, useState } from "react";
import { Restaurant } from "../../types";
import { RestaurantRepository } from "../../services/restaurants/repository";
import { RestaurantConfigRepository } from "../../services/restaurants/configRepository";

interface RestaurantsProps {
  activeRestaurantId: string;
  onSelect: (restaurantId: string) => void;
  refreshKey: number;
}

const Restaurants: React.FC<RestaurantsProps> = ({ activeRestaurantId, onSelect, refreshKey }) => {
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localTick, setLocalTick] = useState(0);

  const restaurants = useMemo(() => {
    void refreshKey;
    void localTick;
    return RestaurantRepository.listRestaurants();
  }, [refreshKey, localTick]);

  const create = () => {
    try {
      setError(null);
      const r = RestaurantRepository.createRestaurant({ name, whatsapp_number_e164: wa });
      // Initialize a default config for the new restaurant
      RestaurantConfigRepository.get(r.id);
      RestaurantConfigRepository.patch(r.id, { name: r.name });
      setName("");
      setWa("");
      onSelect(r.id);
      setLocalTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create restaurant.");
    }
  };

  const toggleStatus = (r: Restaurant) => {
    const next = r.status === "active" ? "disabled" : "active";
    try {
      RestaurantRepository.updateRestaurant(r.id, { status: next });
      setLocalTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update restaurant.");
    }
  };

  const updateSlug = (id: string, slug: string) => {
    try {
      setError(null);
      RestaurantRepository.updateRestaurant(id, { slug });
      setLocalTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update slug.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Restaurants</h3>
        <div className="text-xs text-gray-500">{restaurants.length} total</div>
      </div>

      <div className="border border-gray-200 rounded-md p-3 space-y-3">
        <div className="text-xs font-semibold text-gray-700">Crear restaurante</div>
        <div className="grid grid-cols-1 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="WhatsApp to (E164) ej: +34911222333"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
          >
            Crear
          </button>
          {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>
      </div>

      <div className="space-y-2">
        {restaurants.map((r) => {
          const active = r.id === activeRestaurantId;
          return (
            <div key={r.id} className={`border rounded-md p-3 ${active ? "border-gray-900" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-gray-900 truncate">{r.name}</div>
                    <div className={`text-xs px-2 py-0.5 rounded-full border ${
                      r.status === "active" ? "border-green-200 text-green-700 bg-green-50" : "border-gray-200 text-gray-600 bg-gray-50"
                    }`}>
                      {r.status}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1 truncate">{r.whatsapp_number_e164}</div>
                  <div className="text-[11px] text-gray-400 mt-1">slug: {r.slug}</div>
                  <div className="text-[11px] text-gray-400 mt-1">id: {r.id}</div>
                  <div className="text-[11px] text-gray-400 mt-1">created: {r.created_at}</div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => onSelect(r.id)}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border ${
                      active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {active ? "Seleccionado" : "Seleccionar"}
                  </button>
                  <button
                    onClick={() => toggleStatus(r)}
                    className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
                  >
                    {r.status === "active" ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-600">Slug</label>
                <input
                  defaultValue={r.slug}
                  className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = (e.target as HTMLInputElement).value;
                      updateSlug(r.id, v);
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null);
                    if (!input) return;
                    updateSlug(r.id, input.value);
                  }}
                  className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
                >
                  Guardar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Restaurants;
