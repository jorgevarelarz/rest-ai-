import React, { useMemo } from "react";
import { ReservationRepository } from "../../services/reservations/repository";
import { Reservation } from "../../services/reservations/types";
import { parseTimeToMinutes } from "../../services/reservations/timeSlots";

interface ReservationsTodayProps {
  restaurantId: string;
  date: string; // YYYY-MM-DD
  refreshKey: number;
}

function sortByTime(a: Reservation, b: Reservation): number {
  const am = parseTimeToMinutes(a.time);
  const bm = parseTimeToMinutes(b.time);
  if (!Number.isFinite(am) && !Number.isFinite(bm)) return 0;
  if (!Number.isFinite(am)) return 1;
  if (!Number.isFinite(bm)) return -1;
  return am - bm;
}

const ReservationsToday: React.FC<ReservationsTodayProps> = ({ restaurantId, date, refreshKey }) => {
  const reservations = useMemo(() => {
    void refreshKey;
    return ReservationRepository.getByDateAll(restaurantId, date).slice().sort(sortByTime);
  }, [restaurantId, date, refreshKey]);

  const activeCount = reservations.filter((r) => r.status === "active").length;
  const cancelledCount = reservations.filter((r) => r.status === "cancelled").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Reservas</h3>
        <div className="text-xs text-gray-500">
          Activas: <span className="font-semibold text-gray-900">{activeCount}</span>{" "}
          Canceladas: <span className="font-semibold text-gray-900">{cancelledCount}</span>
        </div>
      </div>

      {reservations.length === 0 ? (
        <div className="text-sm text-gray-500 italic border border-dashed border-gray-200 rounded-md p-4">
          No hay reservas para esta fecha.
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => (
            <div
              key={r.id}
              className={`border rounded-md p-3 ${
                r.status === "cancelled" ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">{r.time}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{r.name}</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-sm font-semibold text-gray-800">{r.partySize}p</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600 truncate">
                    {r.phone} {r.notes ? `· ${r.notes}` : ""}
                  </div>
                  <div className="mt-2 text-xs">
                    Estado:{" "}
                    <span className={r.status === "active" ? "font-semibold text-green-700" : "font-semibold text-gray-500"}>
                      {r.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => ReservationRepository.cancel(restaurantId, r.id)}
                    disabled={r.status !== "active"}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border ${
                      r.status === "active"
                        ? "border-red-200 text-red-700 hover:bg-red-50"
                        : "border-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                    title={r.status === "active" ? "Cancelar reserva" : "Ya está cancelada"}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReservationsToday;
