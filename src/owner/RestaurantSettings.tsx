import React, { useEffect, useMemo, useState } from "react";
import { CapacityConfig, SlotRoundingMode } from "../../services/reservations/types";
import { getReservationSettings, updateReservationSettings } from "../../services/reservations/settings";
import { RestaurantConfigRepository } from "../../services/restaurants/configRepository";
import { RestaurantRepository } from "../../services/restaurants/repository";
import { RestaurantConfig } from "../../types";

interface RestaurantSettingsProps {
  restaurantId: string;
  refreshKey: number;
}

function toInt(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const RestaurantSettings: React.FC<RestaurantSettingsProps> = ({ restaurantId, refreshKey }) => {
  const current = useMemo(() => {
    void refreshKey;
    return getReservationSettings(restaurantId);
  }, [restaurantId, refreshKey]);

  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig>(() => RestaurantConfigRepository.get(restaurantId));

  useEffect(() => {
    setRestaurantConfig(RestaurantConfigRepository.get(restaurantId));
  }, [restaurantId, refreshKey]);

  const [closedDate, setClosedDate] = useState("");

  const applyPatch = (patch: Partial<CapacityConfig>) => {
    updateReservationSettings(restaurantId, patch);
  };

  const patchConfig = (patch: Partial<Omit<RestaurantConfig, "restaurant_id">>) => {
    setRestaurantConfig((prev) => {
      const next: RestaurantConfig = { ...prev, ...patch, restaurant_id: restaurantId };
      RestaurantConfigRepository.upsert(next);
      return next;
    });
    if (typeof patch.name === "string") {
      RestaurantRepository.updateRestaurant(restaurantId, { name: patch.name });
    }
  };

  const addClosedDate = () => {
    const d = closedDate.trim();
    if (!d) return;
    const list = (current.closedDates ?? []).slice();
    if (!list.includes(d)) list.push(d);
    list.sort();
    applyPatch({ closedDates: list });
    setClosedDate("");
  };

  const removeClosedDate = (d: string) => {
    const list = (current.closedDates ?? []).filter((x) => x !== d);
    applyPatch({ closedDates: list });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Datos del restaurante</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre</label>
            <input
              type="text"
              value={restaurantConfig.name}
              onChange={(e) => patchConfig({ name: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Dirección</label>
            <input
              type="text"
              value={restaurantConfig.address}
              onChange={(e) => patchConfig({ address: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Teléfono</label>
            <input
              type="text"
              value={restaurantConfig.phone}
              onChange={(e) => patchConfig({ phone: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Grace period (min)</label>
            <input
              type="number"
              value={restaurantConfig.gracePeriodMin}
              onChange={(e) => patchConfig({ gracePeriodMin: toInt(e.target.value) })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Horario</label>
            <input
              type="text"
              value={restaurantConfig.hours}
              onChange={(e) => patchConfig({ hours: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Turnos (texto)</label>
            <input
              type="text"
              value={restaurantConfig.shifts}
              onChange={(e) => patchConfig({ shifts: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">No-show policy</label>
            <input
              type="text"
              value={restaurantConfig.noShowPolicy}
              onChange={(e) => patchConfig({ noShowPolicy: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2 flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={restaurantConfig.hasTerrace}
                onChange={(e) => patchConfig({ hasTerrace: e.target.checked })}
              />
              Terraza
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={restaurantConfig.hasHighChair}
                onChange={(e) => patchConfig({ hasHighChair: e.target.checked })}
              />
              Tronas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={restaurantConfig.petsAllowed}
                onChange={(e) => patchConfig({ petsAllowed: e.target.checked })}
              />
              Mascotas
            </label>
          </div>
        </div>
      </div>

      <h3 className="text-sm font-bold text-gray-900">Motor de reservas</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Capacidad total</label>
          <input
            type="number"
            value={current.totalCapacity}
            onChange={(e) => applyPatch({ totalCapacity: toInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Max party size</label>
          <input
            type="number"
            value={current.maxPartySize}
            onChange={(e) => applyPatch({ maxPartySize: toInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Duración (min)</label>
          <input
            type="number"
            value={current.standardDurationMin}
            onChange={(e) => applyPatch({ standardDurationMin: toInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Buffer (min)</label>
          <input
            type="number"
            value={current.bufferMin}
            onChange={(e) => applyPatch({ bufferMin: toInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Slot interval</label>
          <select
            value={String(current.slotIntervalMin)}
            onChange={(e) => applyPatch({ slotIntervalMin: toInt(e.target.value) })}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="15">15 min</option>
            <option value="30">30 min</option>
          </select>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Slot rounding</label>
          <select
            value={current.slotRounding}
            onChange={(e) => applyPatch({ slotRounding: e.target.value as SlotRoundingMode })}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="ceil">ceil</option>
            <option value="floor">floor</option>
            <option value="nearest">nearest</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-bold text-gray-900">Closed dates</h4>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={closedDate}
            onChange={(e) => setClosedDate(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={addClosedDate}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50"
          >
            Añadir
          </button>
        </div>

        {(current.closedDates ?? []).length === 0 ? (
          <div className="text-sm text-gray-500 italic border border-dashed border-gray-200 rounded-md p-4">
            No hay días cerrados configurados.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(current.closedDates ?? []).slice().sort().map((d) => (
              <button
                key={d}
                onClick={() => removeClosedDate(d)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 hover:bg-gray-50"
                title="Quitar"
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">Toca una fecha para quitarla.</p>
      </div>
    </div>
  );
};

export default RestaurantSettings;
