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
}

const OwnerPanel: React.FC<OwnerPanelProps> = ({ isOpen, onClose, activeRestaurantId, onSelectRestaurantId }) => {
  const [tab, setTab] = useState<Tab>("restaurants");
  const [date, setDate] = useState<string>(() => toISODate(new Date()));
  const [tick, setTick] = useState(0);

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

  return (
    <div className="absolute inset-y-0 left-0 w-full sm:w-[520px] bg-white shadow-xl z-50 overflow-y-auto border-r border-gray-200">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">Owner Panel</h2>
          <p className="text-xs text-gray-500 truncate">
            {restaurant ? `${restaurant.name} · ${restaurant.whatsapp_number_e164}` : "Selecciona un restaurante"}
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full" aria-label="Close owner panel">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("restaurants")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border ${
              tab === "restaurants"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Restaurants
          </button>
          <button
            onClick={() => setTab("today")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border ${
              tab === "today" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border ${
              tab === "settings" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Ajustes
          </button>
          <button
            onClick={() => setTab("menu")}
            className={`px-3 py-2 rounded-md text-sm font-semibold border ${
              tab === "menu" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Carta
          </button>
        </div>

        {tab === "today" ? (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ml-auto border border-gray-200 rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={() => setDate(toISODate(new Date()))}
                className="px-3 py-2 rounded-md text-sm border border-gray-200 hover:bg-gray-50"
              >
                Hoy
              </button>
              <button
                onClick={() => setDate(tomorrow)}
                className="px-3 py-2 rounded-md text-sm border border-gray-200 hover:bg-gray-50"
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
