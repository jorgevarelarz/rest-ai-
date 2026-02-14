import React, { useEffect, useMemo, useState } from "react";
import Restaurants from "./Restaurants";
import ReservationsToday from "./ReservationsToday";
import RestaurantSettings from "./RestaurantSettings";
import MenuManager from "./MenuManager";
import { ReservationRepository } from "../../services/reservations/repository";
import { subscribeReservationSettings } from "../../services/reservations/settings";
import { RestaurantRepository } from "../../services/restaurants/repository";

type Tab = "restaurants" | "today" | "settings" | "menu";

function toISODate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

interface OwnerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeRestaurantId: string;
  onSelectRestaurantId: (restaurantId: string) => void;
  standalone?: boolean;
  onLogout?: () => void;
}

const OwnerPanel: React.FC<OwnerPanelProps> = ({
  isOpen,
  onClose,
  activeRestaurantId,
  onSelectRestaurantId,
  standalone = false,
  onLogout
}) => {
  const [tab, setTab] = useState<Tab>("restaurants");
  const [date, setDate] = useState<string>(() => toISODate(new Date()));
  const [tick, setTick] = useState(0);
  const today = toISODate(new Date());

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const unsubRepo = ReservationRepository.subscribe(() => setTick((t) => t + 1));
    const unsubSettings = subscribeReservationSettings(activeRestaurantId, () => setTick((t) => t + 1));
    return () => {
      unsubRepo();
      unsubSettings();
    };
  }, [isOpen, activeRestaurantId]);

  if (!isOpen) return null;

  const restaurant = RestaurantRepository.getById(activeRestaurantId);
  const allRestaurants = RestaurantRepository.listRestaurants();
  const activeRestaurants = allRestaurants.filter((r) => r.status === "active").length;
  const todayReservations = ReservationRepository.getByDateAll(activeRestaurantId, today);
  const todayActiveCount = todayReservations.filter((r) => r.status === "active").length;
  const todayCancelledCount = todayReservations.filter((r) => r.status === "cancelled").length;

  return (
    <div
      className={
        standalone
          ? "w-full h-full bg-slate-50 overflow-y-auto"
          : "absolute inset-y-0 left-0 w-full sm:w-[620px] bg-slate-50 shadow-xl z-50 overflow-y-auto border-r border-gray-200"
      }
    >
      <div className="p-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-20">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 truncate">Panel restaurante</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Operativo
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate">
            {restaurant ? `${restaurant.name} · ${restaurant.whatsapp_number_e164}` : "Selecciona un restaurante"}
          </p>
        </div>
        {standalone ? (
          <div className="flex items-center gap-2">
            {onLogout && (
              <button onClick={onLogout} className="px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100">
                Cerrar sesión
              </button>
            )}
            <button onClick={onClose} className="px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100">
              Ir al chat
            </button>
          </div>
        ) : (
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full" aria-label="Close owner panel">
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] text-slate-500">Restaurantes</div>
            <div className="text-xl font-bold text-slate-900">{allRestaurants.length}</div>
            <div className="text-[11px] text-slate-500">{activeRestaurants} activos</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] text-slate-500">Hoy</div>
            <div className="text-xl font-bold text-slate-900">{todayReservations.length}</div>
            <div className="text-[11px] text-slate-500">total reservas</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] text-slate-500">Activas</div>
            <div className="text-xl font-bold text-emerald-700">{todayActiveCount}</div>
            <div className="text-[11px] text-slate-500">hoy</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] text-slate-500">Canceladas</div>
            <div className="text-xl font-bold text-slate-700">{todayCancelledCount}</div>
            <div className="text-[11px] text-slate-500">hoy</div>
          </div>
        </div>

        <div className="sticky top-[73px] z-10 bg-slate-50 py-1">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setTab("restaurants")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border whitespace-nowrap ${
              tab === "restaurants"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
            }`}
          >
            Restaurants
          </button>
          <button
            onClick={() => setTab("today")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border whitespace-nowrap ${
              tab === "today" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border whitespace-nowrap ${
              tab === "settings" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
            }`}
          >
            Ajustes
          </button>
          <button
            onClick={() => setTab("menu")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border whitespace-nowrap ${
              tab === "menu" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
            }`}
          >
            Carta
          </button>
          </div>
        </div>

        {tab === "today" ? (
          <>
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-3">
              <label className="text-xs font-semibold text-slate-600">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ml-auto border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
              />
              <button
                onClick={() => setDate(toISODate(new Date()))}
                className="px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100"
              >
                Hoy
              </button>
              <button
                onClick={() => setDate(tomorrow)}
                className="px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100"
              >
                Mañana
              </button>
            </div>
            <ReservationsToday restaurantId={activeRestaurantId} date={date} refreshKey={tick} />
          </>
        ) : tab === "settings" ? (
          <RestaurantSettings restaurantId={activeRestaurantId} refreshKey={tick} />
        ) : tab === "menu" ? (
          <MenuManager restaurantId={activeRestaurantId} refreshKey={tick} />
        ) : (
          <Restaurants activeRestaurantId={activeRestaurantId} onSelect={onSelectRestaurantId} refreshKey={tick} />
        )}
      </div>
    </div>
  );
};

export default OwnerPanel;
