import type { Reservation } from "../reservations/types";

type CalendarStatus = {
  connected: boolean;
  email?: string;
  calendar_id?: string;
  has_config: boolean;
};

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchGoogleCalendarStatus(restaurantId: string): Promise<CalendarStatus> {
  try {
    const res = await fetch(`/api/calendar/status?rid=${encodeURIComponent(restaurantId)}`, {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return { connected: false, has_config: false };
    const body = await parseJson<CalendarStatus>(res);
    return body ?? { connected: false, has_config: false };
  } catch {
    return { connected: false, has_config: false };
  }
}

export function connectGoogleCalendar(restaurantId: string): void {
  window.location.href = `/api/calendar/connect?rid=${encodeURIComponent(restaurantId)}`;
}

export async function disconnectGoogleCalendar(restaurantId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/calendar/disconnect`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rid: restaurantId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncCalendarCreate(
  restaurantId: string,
  reservation: Reservation,
  restaurantName: string,
  businessType: "hospitality" | "professional_services"
): Promise<{ event_id?: string }> {
  try {
    const res = await fetch(`/api/calendar/create_reservation_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rid: restaurantId,
        reservation,
        restaurant_name: restaurantName,
        business_type: businessType,
      }),
    });
    if (!res.ok) return {};
    const body = await parseJson<{ event_id?: string }>(res);
    return body ?? {};
  } catch {
    return {};
  }
}

export async function syncCalendarUpdate(
  restaurantId: string,
  reservation: Reservation,
  restaurantName: string,
  businessType: "hospitality" | "professional_services"
): Promise<{ event_id?: string }> {
  try {
    const res = await fetch(`/api/calendar/update_reservation_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rid: restaurantId,
        reservation,
        restaurant_name: restaurantName,
        business_type: businessType,
      }),
    });
    if (!res.ok) return {};
    const body = await parseJson<{ event_id?: string }>(res);
    return body ?? {};
  } catch {
    return {};
  }
}

export async function syncCalendarCancel(
  restaurantId: string,
  reservation: Reservation
): Promise<void> {
  try {
    await fetch(`/api/calendar/cancel_reservation_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rid: restaurantId,
        reservation,
      }),
    });
  } catch {
    // no-op
  }
}
