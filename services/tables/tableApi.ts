import type { RestaurantLayoutWall, RestaurantTable, TableStatus } from "../../types";

export type TablesState = { tables: RestaurantTable[]; walls: RestaurantLayoutWall[] };

export async function fetchTablesState(restaurantId: string): Promise<TablesState> {
  const res = await fetch(`/api/tables/state?rid=${encodeURIComponent(restaurantId)}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load tables.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export async function createTable(
  restaurantId: string,
  input: { name: string; capacity: number; zone?: string; notes?: string; kind?: RestaurantTable["kind"] }
): Promise<TablesState> {
  const res = await fetch(`/api/tables/create`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rid: restaurantId, ...input }),
  });
  if (!res.ok) throw new Error("Failed to create table.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export async function patchTable(
  restaurantId: string,
  tableId: string,
  patch: Partial<Pick<RestaurantTable, "name" | "capacity" | "zone" | "notes" | "status" | "layout_x" | "layout_y" | "kind">>
): Promise<TablesState> {
  const res = await fetch(`/api/tables/patch`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rid: restaurantId, table_id: tableId, patch }),
  });
  if (!res.ok) throw new Error("Failed to update table.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export async function deleteTable(restaurantId: string, tableId: string): Promise<TablesState> {
  const res = await fetch(`/api/tables/delete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rid: restaurantId, table_id: tableId }),
  });
  if (!res.ok) throw new Error("Failed to delete table.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export function connectTablesStream(
  restaurantId: string,
  onState: (state: TablesState) => void,
  onError?: (err: unknown) => void
): () => void {
  const es = new EventSource(`/api/tables/stream?rid=${encodeURIComponent(restaurantId)}`);
  const onMessage = (ev: MessageEvent) => {
    try {
      const parsed = JSON.parse(ev.data) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
      onState({
        tables: Array.isArray(parsed.tables) ? parsed.tables : [],
        walls: Array.isArray(parsed.walls) ? parsed.walls : [],
      });
    } catch (e) {
      onError?.(e);
    }
  };
  es.addEventListener("tables", onMessage as any);
  es.onerror = (e) => onError?.(e);
  return () => {
    try {
      es.removeEventListener("tables", onMessage as any);
      es.close();
    } catch {
      // no-op
    }
  };
}

export async function createWall(
  restaurantId: string,
  input: Pick<RestaurantLayoutWall, "x" | "y" | "w" | "h"> & { kind?: RestaurantLayoutWall["kind"] }
): Promise<TablesState> {
  const res = await fetch(`/api/tables/wall_create`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rid: restaurantId, ...input }),
  });
  if (!res.ok) throw new Error("Failed to create wall.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export async function patchWall(
  restaurantId: string,
  wallId: string,
  patch: Partial<Pick<RestaurantLayoutWall, "x" | "y" | "w" | "h">>
): Promise<TablesState> {
  const res = await fetch(`/api/tables/wall_patch`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rid: restaurantId, wall_id: wallId, patch }),
  });
  if (!res.ok) throw new Error("Failed to update wall.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export async function deleteWall(restaurantId: string, wallId: string): Promise<TablesState> {
  const res = await fetch(`/api/tables/wall_delete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rid: restaurantId, wall_id: wallId }),
  });
  if (!res.ok) throw new Error("Failed to delete wall.");
  const data = (await res.json()) as { tables?: RestaurantTable[]; walls?: RestaurantLayoutWall[] };
  return {
    tables: Array.isArray(data.tables) ? data.tables : [],
    walls: Array.isArray(data.walls) ? data.walls : [],
  };
}

export const TABLE_STATUSES: Array<{ key: TableStatus; label: string }> = [
  { key: "free", label: "Libre" },
  { key: "reserved", label: "Reservada" },
  { key: "occupied", label: "Ocupada" },
  { key: "blocked", label: "Bloqueada" },
];
