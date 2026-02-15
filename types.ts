export interface RestaurantConfig {
  restaurant_id: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
  shifts: string;
  hasTerrace: boolean;
  hasHighChair: boolean;
  petsAllowed: boolean;
  gracePeriodMin: number;
  noShowPolicy: string;
  // Time-slot policy for the reservation engine UX (the engine is the source of truth).
  slot_interval_min: number; // e.g. 15 / 30
  slot_rounding: "nearest" | "floor" | "ceil";
}

export interface Restaurant {
  id: string; // UUID
  slug: string; // unique, user-editable (validated)
  name: string;
  whatsapp_number_e164: string; // unique
  status: "active" | "disabled";
  created_at: string; // ISO timestamp
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  sort: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description?: string;
  price_eur?: number;
  allergens?: string[];
  available: boolean;
  sort: number;
}

export type TableStatus = "free" | "occupied" | "reserved" | "blocked";
export type TableKind = "table" | "stool";

export interface RestaurantLayoutWall {
  id: string;
  restaurant_id: string;
  // Normalized rect in [0..1].
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "wall" | "bar";
  updated_at: number; // epoch ms
}

export interface RestaurantTable {
  id: string;
  restaurant_id: string;
  name: string; // e.g. "T1", "Mesa 12"
  capacity: number; // seats
  zone?: string; // "terraza", "sala", etc.
  kind?: TableKind; // default: "table"
  status: TableStatus;
  // Normalized coordinates in [0..1] for visual map layout.
  layout_x?: number;
  layout_y?: number;
  notes?: string;
  updated_at: number; // epoch ms
}

export interface ReservationData {
  name: string | null;
  phone: string | null;
  date: string | null;
  time: string | null;
  party_size: number | null;
  notes: string | null;
}

export interface BackendAction {
  type: "check_availability" | "create_reservation" | "update_reservation" | "cancel_reservation" | "none";
  payload: any;
}

export interface AssistantParsedResponse {
  intent: "reserve" | "modify" | "cancel" | "info" | "handoff" | "unknown";
  confidence: number;
  missing_fields: string[];
  reservation: ReservationData;
  proposed_alternatives: { date: string; time: string }[];
  backend_action: BackendAction;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string; // The visible text
  raw?: string; // The full raw response including JSON
  parsedData?: AssistantParsedResponse | null;
  timestamp: number;
}

export type AvailabilityStatus = "unknown" | "available" | "not_available";

export interface SystemState {
  availability: AvailabilityStatus;
  lastChecked: string | null;
}

export type ReservationStep =
  | "idle"
  | "collect_date"
  | "collect_time"
  | "collect_party"
  | "collect_name"
  | "confirming"
  | "done";

export interface PendingAction {
  type: 'update_reservation' | 'cancel_reservation';
  data?: any;
}

export interface ReservationState {
  step: ReservationStep;
  date: string | null;
  time: string | null;
  party_size: number | null;
  name: string | null;
  notes: string | null;
  pendingAction: PendingAction | null;
}

export interface ReservationContext {
  hasActiveReservation: boolean;
  activeReservationCount: number;
  simulatedUserPhone: string; // New field for identity simulation
}
