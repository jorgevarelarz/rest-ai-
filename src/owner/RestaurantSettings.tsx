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

  const openingHours = current.openingHours ?? [];

  const patchShift = (index: number, field: "start" | "end", value: string) => {
    const next = openingHours.map((s) => ({ ...s }));
    while (next.length <= index) {
      next.push({ start: "00:00", end: "00:00" });
    }
    next[index][field] = value;
    applyPatch({ openingHours: next });
  };

  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Información general</h3>
          <p className="text-xs text-slate-500">Datos públicos que verá el cliente durante la conversación.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del restaurante</label>
            <input
              type="text"
              value={restaurantConfig.name}
              onChange={(e) => patchConfig({ name: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Dirección</label>
            <input
              type="text"
              value={restaurantConfig.address}
              onChange={(e) => patchConfig({ address: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono</label>
            <input
              type="text"
              value={restaurantConfig.phone}
              onChange={(e) => patchConfig({ phone: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">No-show (texto corto)</label>
            <input
              type="text"
              value={restaurantConfig.noShowPolicy}
              onChange={(e) => patchConfig({ noShowPolicy: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Horario y turnos</h3>
          <p className="text-xs text-slate-500">Ajusta los turnos operativos que usa el motor de reservas.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Comida inicia</label>
            <input
              type="time"
              value={openingHours[0]?.start ?? "13:00"}
              onChange={(e) => patchShift(0, "start", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Comida termina</label>
            <input
              type="time"
              value={openingHours[0]?.end ?? "16:00"}
              onChange={(e) => patchShift(0, "end", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cena inicia</label>
            <input
              type="time"
              value={openingHours[1]?.start ?? "20:00"}
              onChange={(e) => patchShift(1, "start", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cena termina</label>
            <input
              type="time"
              value={openingHours[1]?.end ?? "23:30"}
              onChange={(e) => patchShift(1, "end", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Horario en texto (chat)</label>
            <input
              type="text"
              value={restaurantConfig.hours}
              onChange={(e) => patchConfig({ hours: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Turnos en texto (chat)</label>
            <input
              type="text"
              value={restaurantConfig.shifts}
              onChange={(e) => patchConfig({ shifts: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Experiencia del cliente</h3>
          <p className="text-xs text-slate-500">Opciones que el asistente usará para responder preguntas frecuentes.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cortesía llegada tarde (min)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={restaurantConfig.gracePeriodMin}
              onChange={(e) => patchConfig({ gracePeriodMin: toInt(e.target.value) })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-1 flex items-end">
            <div className="w-full grid grid-cols-1 gap-2">
              <label className="inline-flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span>Terraza disponible</span>
                <input
                  type="checkbox"
                  checked={restaurantConfig.hasTerrace}
                  onChange={(e) => patchConfig({ hasTerrace: e.target.checked })}
                />
              </label>
              <label className="inline-flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span>Tronas</span>
                <input
                  type="checkbox"
                  checked={restaurantConfig.hasHighChair}
                  onChange={(e) => patchConfig({ hasHighChair: e.target.checked })}
                />
              </label>
              <label className="inline-flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span>Mascotas permitidas</span>
                <input
                  type="checkbox"
                  checked={restaurantConfig.petsAllowed}
                  onChange={(e) => patchConfig({ petsAllowed: e.target.checked })}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Motor de reservas</h3>
          <p className="text-xs text-slate-500">Define capacidad, duración y normalización de horarios.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Capacidad total (personas)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={current.totalCapacity}
              onChange={(e) => applyPatch({ totalCapacity: toInt(e.target.value) })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Máximo por reserva</label>
            <input
              type="number"
              min={1}
              step={1}
              value={current.maxPartySize}
              onChange={(e) => applyPatch({ maxPartySize: toInt(e.target.value) })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Duración estándar (min)</label>
            <input
              type="number"
              min={1}
              step={5}
              value={current.standardDurationMin}
              onChange={(e) => applyPatch({ standardDurationMin: toInt(e.target.value) })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer entre mesas (min)</label>
            <input
              type="number"
              min={0}
              step={5}
              value={current.bufferMin}
              onChange={(e) => applyPatch({ bufferMin: toInt(e.target.value) })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Intervalo de slot</label>
            <select
              value={String(current.slotIntervalMin)}
              onChange={(e) => applyPatch({ slotIntervalMin: toInt(e.target.value) })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Redondeo de hora</label>
            <select
              value={current.slotRounding}
              onChange={(e) => applyPatch({ slotRounding: e.target.value as SlotRoundingMode })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="ceil">Al siguiente slot</option>
              <option value="floor">Al slot anterior</option>
              <option value="nearest">Al más cercano</option>
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Días cerrados</h4>
          <p className="text-xs text-slate-500">Añade festivos o cierres puntuales. Toca una fecha para eliminarla.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={closedDate}
            onChange={(e) => setClosedDate(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={addClosedDate}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
          >
            Añadir
          </button>
        </div>

        {(current.closedDates ?? []).length === 0 ? (
          <div className="text-sm text-slate-500 italic border border-dashed border-slate-300 rounded-md p-4">
            No hay días cerrados configurados.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(current.closedDates ?? []).slice().sort().map((d) => (
              <button
                key={d}
                onClick={() => removeClosedDate(d)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-300 hover:bg-slate-100"
                title="Quitar"
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default RestaurantSettings;
