import React, { useEffect, useMemo, useState } from "react";
import type { RestaurantTable, TableStatus } from "../../types";
import type { RestaurantLayoutWall } from "../../types";
import {
  connectTablesStream,
  createTable,
  createWall,
  deleteTable,
  deleteWall,
  fetchTablesState,
  patchTable,
  patchWall,
  TABLE_STATUSES,
} from "../../services/tables/tableApi";

interface TablesLiveProps {
  restaurantId: string;
}

type ViewMode = "map" | "list";
type MapTool = "move_tables" | "walls";
type WallKind = "wall" | "bar";

const statusColor = (s: TableStatus): string => {
  switch (s) {
    case "free":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "reserved":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "occupied":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-900";
    default:
      return "border-slate-200 bg-white text-slate-900";
  }
};

const statusLabel = (s: TableStatus): string => {
  return TABLE_STATUSES.find((x) => x.key === s)?.label ?? s;
};

const byZoneThenName = (a: RestaurantTable, b: RestaurantTable): number => {
  const az = (a.zone || "").localeCompare(b.zone || "");
  if (az !== 0) return az;
  return a.name.localeCompare(b.name);
};

const TablesLive: React.FC<TablesLiveProps> = ({ restaurantId }) => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [walls, setWalls] = useState<RestaurantLayoutWall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("map");
  const [isEditLayout, setIsEditLayout] = useState(false);
  const [tool, setTool] = useState<MapTool>("move_tables");
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [newKind, setNewKind] = useState<"table" | "stool">("table");
  const [zoneMode, setZoneMode] = useState<"interior" | "terraza" | "custom">("interior");
  const [zoneCustom, setZoneCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ px: number; py: number; x: number; y: number } | null>(null);
  const [draggingWallId, setDraggingWallId] = useState<string | null>(null);
  const [dragWallStart, setDragWallStart] = useState<{ px: number; py: number; x: number; y: number } | null>(null);
  const [dragWallPos, setDragWallPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        setIsLoading(true);
        const initial = await fetchTablesState(restaurantId);
        if (cancelled) return;
        setTables(initial.tables);
        setWalls(initial.walls);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error cargando mesas.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    setError(null);
    const unsub = connectTablesStream(
      restaurantId,
      (next) => {
        setTables(next.tables);
        setWalls(next.walls);
      },
      () => setError("Conexión realtime inestable. Reintentando...")
    );
    return () => unsub();
  }, [restaurantId]);

  const getPos = (t: RestaurantTable): { x: number; y: number } => {
    const x = typeof t.layout_x === "number" ? t.layout_x : 0.5;
    const y = typeof t.layout_y === "number" ? t.layout_y : 0.5;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  };

  const snap01 = (v: number, step = 0.02): number => {
    const snapped = Math.round(v / step) * step;
    return Math.min(1, Math.max(0, Number(snapped.toFixed(4))));
  };

  const grouped = useMemo(() => {
    const sorted = tables.slice().sort(byZoneThenName);
    const map = new Map<string, RestaurantTable[]>();
    for (const t of sorted) {
      const k = t.zone?.trim() || "Sin zona";
      const list = map.get(k) ?? [];
      list.push(t);
      map.set(k, list);
    }
    return Array.from(map.entries());
  }, [tables]);

  const counts = useMemo(() => {
    const c = { free: 0, reserved: 0, occupied: 0, blocked: 0 };
    for (const t of tables) c[t.status]++;
    return c;
  }, [tables]);

  const add = async () => {
    try {
      setError(null);
      const n = name.trim();
      if (!n) {
        setError("Nombre de mesa obligatorio (ej: T1).");
        return;
      }
      if (!Number.isFinite(capacity) || capacity < 1) {
        setError("Capacidad inválida.");
        return;
      }
      const zone =
        zoneMode === "custom" ? zoneCustom.trim() : zoneMode === "interior" ? "interior" : "terraza";
      const next = await createTable(restaurantId, {
        name: n,
        capacity: newKind === "stool" ? 1 : Math.trunc(capacity),
        zone: zone || undefined,
        kind: newKind,
        notes: notes.trim() || undefined,
      });
      setTables(next.tables);
      setWalls(next.walls);
      setName("");
      setZoneCustom("");
      setZoneMode("interior");
      setNewKind("table");
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando mesa.");
    }
  };

  const setStatus = async (t: RestaurantTable, status: TableStatus) => {
    try {
      setError(null);
      const next = await patchTable(restaurantId, t.id, { status });
      setTables(next.tables);
      setWalls(next.walls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando estado.");
    }
  };

  const selected = useMemo(() => tables.find((t) => t.id === selectedId) ?? null, [tables, selectedId]);
  const selectedWall = useMemo(() => walls.find((w) => w.id === selectedWallId) ?? null, [walls, selectedWallId]);

  const remove = async (t: RestaurantTable) => {
    try {
      setError(null);
      const next = await deleteTable(restaurantId, t.id);
      setTables(next.tables);
      setWalls(next.walls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error borrando mesa.");
    }
  };

  const addWall = async (x: number, y: number) => {
    try {
      setError(null);
      // Default size: wall segment / bar counter.
      const w = wallKind === "bar" ? 0.28 : 0.18;
      const h = wallKind === "bar" ? 0.06 : 0.03;
      const next = await createWall(restaurantId, {
        x: snap01(x),
        y: snap01(y),
        w: snap01(w),
        h: snap01(h),
        kind: wallKind,
      });
      setTables(next.tables);
      setWalls(next.walls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando pared.");
    }
  };

  const moveWall = async (wall: RestaurantLayoutWall, x: number, y: number) => {
    try {
      setError(null);
      const next = await patchWall(restaurantId, wall.id, { x: snap01(x), y: snap01(y) });
      setTables(next.tables);
      setWalls(next.walls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando pared.");
    }
  };

  const removeWall = async (wall: RestaurantLayoutWall) => {
    try {
      setError(null);
      const next = await deleteWall(restaurantId, wall.id);
      setTables(next.tables);
      setWalls(next.walls);
      setSelectedWallId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error borrando pared.");
    }
  };

  const clampRectCenter = (x: number, y: number, w: number, h: number) => {
    const ww = Math.min(1, Math.max(0.01, w));
    const hh = Math.min(1, Math.max(0.01, h));
    const minX = ww / 2;
    const maxX = 1 - ww / 2;
    const minY = hh / 2;
    const maxY = 1 - hh / 2;
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
      w: ww,
      h: hh,
    };
  };

  const rotateWall = async (wall: RestaurantLayoutWall) => {
    const next = clampRectCenter(wall.x, wall.y, wall.h, wall.w);
    try {
      setError(null);
      const state = await patchWall(restaurantId, wall.id, { x: next.x, y: next.y, w: next.w, h: next.h });
      setTables(state.tables);
      setWalls(state.walls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error rotando pared.");
    }
  };

  const resizeWall = async (wall: RestaurantLayoutWall, nextW: number, nextH: number) => {
    const next = clampRectCenter(wall.x, wall.y, nextW, nextH);
    try {
      setError(null);
      const state = await patchWall(restaurantId, wall.id, { x: next.x, y: next.y, w: next.w, h: next.h });
      setTables(state.tables);
      setWalls(state.walls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error redimensionando pared.");
    }
  };

  const normZone = (z?: string): "interior" | "terraza" | "otro" => {
    const t = (z || "").trim().toLowerCase();
    if (!t) return "interior";
    if (t.includes("terraza")) return "terraza";
    if (t.includes("interior") || t.includes("sala")) return "interior";
    return "otro";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Mesas en tiempo real</h3>
          <p className="text-xs text-slate-500">Este panel es la fuente de verdad del estado actual.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500 hidden sm:block">
            Libre: <span className="font-semibold text-slate-900">{counts.free}</span>{" "}
            Reservada: <span className="font-semibold text-slate-900">{counts.reserved}</span>{" "}
            Ocupada: <span className="font-semibold text-slate-900">{counts.occupied}</span>{" "}
            Bloqueada: <span className="font-semibold text-slate-900">{counts.blocked}</span>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1">
            <button
              onClick={() => setView("map")}
              className={`px-2 py-1 rounded text-xs font-semibold ${view === "map" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              Mapa
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-2 py-1 rounded text-xs font-semibold ${view === "list" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              Lista
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 border border-slate-300 bg-white rounded-md px-2 py-1">
            <input type="checkbox" checked={isEditLayout} onChange={(e) => setIsEditLayout(e.target.checked)} />
            Editar mapa
          </label>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="text-sm font-bold text-slate-900">Nueva mesa</div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={newKind === "stool" ? "Taburete (B1)" : "Nombre (T1)"}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={newKind}
            onChange={(e) => {
              const k = e.target.value as "table" | "stool";
              setNewKind(k);
              if (k === "stool") {
                setCapacity(1);
                setZoneMode("custom");
                setZoneCustom("barra");
              }
            }}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="table">Mesa</option>
            <option value="stool">Taburete (1)</option>
          </select>
          <input
            type="number"
            min={1}
            step={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            disabled={newKind === "stool"}
            className={`border border-slate-300 rounded-md px-3 py-2 text-sm ${newKind === "stool" ? "bg-slate-100 text-slate-500" : ""}`}
          />
          <select
            value={zoneMode}
            onChange={(e) => setZoneMode(e.target.value as any)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="interior">Interior</option>
            <option value="terraza">Terraza</option>
            <option value="custom">Otra...</option>
          </select>
          <button onClick={add} className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100">
            Crear
          </button>
        </div>
        {zoneMode === "custom" ? (
          <input
            value={zoneCustom}
            onChange={(e) => setZoneCustom(e.target.value)}
            placeholder="Nombre de zona (ej: barra)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        ) : null}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
        />
      </section>

      {isLoading ? (
        <div className="text-sm text-slate-500">Cargando...</div>
      ) : tables.length === 0 ? (
        <div className="text-sm text-slate-500 italic border border-dashed border-slate-300 rounded-md p-4">
          No hay mesas configuradas. Crea algunas para empezar.
        </div>
      ) : view === "map" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900">Mapa</div>
              <div className="flex items-center gap-2">
                {isEditLayout ? (
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1">
                    <button
                      onClick={() => setTool("move_tables")}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        tool === "move_tables" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Mover mesas
                    </button>
                    <button
                      onClick={() => setTool("walls")}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        tool === "walls" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Paredes
                    </button>
                  </div>
                ) : null}
                {isEditLayout && tool === "walls" ? (
                  <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1">
                    <button
                      onClick={() => setWallKind("wall")}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        wallKind === "wall" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Pared
                    </button>
                    <button
                      onClick={() => setWallKind("bar")}
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        wallKind === "bar" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      Barra
                    </button>
                  </div>
                ) : null}
                <div className="text-xs text-slate-500">
                  {isEditLayout
                    ? tool === "walls"
                      ? "Click para añadir, arrastra para mover"
                      : "Arrastra mesas para recolocar"
                    : "Toca una mesa para ver detalles"}
                </div>
              </div>
            </div>
            <div
              className="relative mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"
              style={{
                aspectRatio: "16 / 9",
                backgroundImage:
                  "linear-gradient(to right, rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.25) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
              onClick={(e) => {
                if (!isEditLayout) return;
                if (tool !== "walls") return;
                // Add a wall where user clicks (normalized).
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                void addWall(x, y);
              }}
              onPointerMove={(e) => {
                if (!isEditLayout) return;
                if (draggingWallId && dragWallStart) {
                  const el = e.currentTarget as HTMLDivElement;
                  const rect = el.getBoundingClientRect();
                  const px = e.clientX - rect.left;
                  const py = e.clientY - rect.top;
                  const dx = px - dragWallStart.px;
                  const dy = py - dragWallStart.py;
                  const x = snap01(dragWallStart.x + dx / rect.width);
                  const y = snap01(dragWallStart.y + dy / rect.height);
                  setDragWallPos({ x, y });
                  return;
                }
                if (!draggingId || !dragStart) return;
                const el = e.currentTarget as HTMLDivElement;
                const rect = el.getBoundingClientRect();
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;
                const dx = px - dragStart.px;
                const dy = py - dragStart.py;
                const x = snap01(dragStart.x + dx / rect.width);
                const y = snap01(dragStart.y + dy / rect.height);
                setDragPos({ x, y });
              }}
              onPointerUp={async (e) => {
                if (!isEditLayout) return;
                if (draggingWallId) {
                  const w = walls.find((x) => x.id === draggingWallId);
                  const nextPos = dragWallPos;
                  setDraggingWallId(null);
                  setDragWallPos(null);
                  setDragWallStart(null);
                  if (w && nextPos) await moveWall(w, nextPos.x, nextPos.y);
                  return;
                }
                if (!draggingId) return;
                const t = tables.find((x) => x.id === draggingId);
                const nextPos = dragPos;
                setDraggingId(null);
                setDragPos(null);
                setDragStart(null);
                if (!t || !nextPos) return;
                try {
                  setError(null);
                  const next = await patchTable(restaurantId, t.id, { layout_x: nextPos.x, layout_y: nextPos.y });
                  setTables(next.tables);
                  setWalls(next.walls);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Error guardando posición.");
                }
              }}
              onPointerLeave={() => {
                if (!isEditLayout) return;
                if (draggingWallId) {
                  setDraggingWallId(null);
                  setDragWallPos(null);
                  setDragWallStart(null);
                  return;
                }
                if (!draggingId) return;
                setDraggingId(null);
                setDragPos(null);
                setDragStart(null);
              }}
            >
              {/* Zones overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-y-0 left-0 w-[60%] bg-slate-100/40" />
                <div className="absolute inset-y-0 right-0 w-[40%] bg-emerald-100/30" />
                <div className="absolute top-2 left-2 text-[11px] font-semibold text-slate-600">Interior</div>
                <div className="absolute top-2 right-2 text-[11px] font-semibold text-emerald-700">Terraza</div>
              </div>

              {/* Walls */}
              {walls.map((w) => {
                const isSel = selectedWallId === w.id;
                const pos = draggingWallId === w.id && dragWallPos ? dragWallPos : { x: w.x, y: w.y };
                const isBar = w.kind === "bar";
                return (
                  <div
                    key={w.id}
                    className={`absolute rounded-md border ${
                      isSel
                        ? isBar
                          ? "border-indigo-900 bg-indigo-900/70"
                          : "border-slate-900 bg-slate-900/70"
                        : isBar
                        ? "border-indigo-700 bg-indigo-700/55"
                        : "border-slate-700 bg-slate-700/60"
                    }`}
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      width: `${w.w * 100}%`,
                      height: `${w.h * 100}%`,
                      transform: "translate(-50%, -50%)",
                      cursor: isEditLayout && tool === "walls" ? "grab" : "default",
                      pointerEvents: isEditLayout && tool === "walls" ? "auto" : "none",
                    }}
                    onPointerDown={(e) => {
                      if (!isEditLayout) return;
                      if (tool !== "walls") return;
                      e.stopPropagation();
                      const el = e.currentTarget.parentElement as HTMLDivElement | null;
                      if (!el) return;
                      const rect = el.getBoundingClientRect();
                      const px = e.clientX - rect.left;
                      const py = e.clientY - rect.top;
                      setSelectedWallId(w.id);
                      setSelectedId(null);
                      setDraggingWallId(w.id);
                      setDragWallStart({ px, py, x: w.x, y: w.y });
                      setDragWallPos({ x: w.x, y: w.y });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedWallId(w.id);
                      setSelectedId(null);
                    }}
                    title="Pared"
                  />
                );
              })}

              {tables.map((t) => {
                const base = getPos(t);
                const pos = draggingId === t.id && dragPos ? dragPos : base;
                const selected = selectedId === t.id;
                const z = normZone(t.zone);
                const kind = t.kind === "stool" ? "stool" : "table";
                return (
                  <button
                    key={t.id}
                    className={`absolute rounded-xl border shadow-sm px-3 py-2 text-left ${
                      selected ? "ring-2 ring-slate-900" : ""
                    } ${statusColor(t.status)}`}
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      minWidth: kind === "stool" ? "56px" : "110px",
                      padding: kind === "stool" ? "8px" : undefined,
                      touchAction: isEditLayout && tool === "move_tables" ? "none" : "auto",
                      cursor: isEditLayout && tool === "move_tables" ? "grab" : "pointer",
                    }}
                    onClick={() => setSelectedId(t.id)}
                    onPointerDown={(e) => {
                      if (!isEditLayout) return;
                      if (tool !== "move_tables") return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const el = e.currentTarget.parentElement as HTMLDivElement | null;
                      if (!el) return;
                      const rect = el.getBoundingClientRect();
                      const px = e.clientX - rect.left;
                      const py = e.clientY - rect.top;
                      const { x, y } = getPos(t);
                      setSelectedId(t.id);
                      setSelectedWallId(null);
                      setDraggingId(t.id);
                      setDragStart({ px, py, x, y });
                      setDragPos({ x, y });
                    }}
                    title={isEditLayout ? "Arrastrar para mover" : "Seleccionar mesa"}
                  >
                    {kind === "stool" ? (
                      <>
                        <div className="text-xs font-bold text-center truncate">{t.name}</div>
                        <div className="text-[10px] text-center opacity-80">{statusLabel(t.status)}</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold truncate">{t.name}</div>
                          <div className="text-xs font-semibold opacity-80">{t.capacity}p</div>
                        </div>
                        <div className="text-[11px] opacity-80">{statusLabel(t.status)}</div>
                        <div className="mt-1 text-[11px] opacity-80">
                          {z === "terraza" ? "Terraza" : z === "interior" ? "Interior" : t.zone || "Interior"}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
            <div className="text-sm font-bold text-slate-900">Detalles</div>
            {!selected && !selectedWall ? (
              <div className="text-sm text-slate-500">Selecciona una mesa o una pared en el mapa.</div>
            ) : (
              <>
                {selected ? (
                  <>
                    <div className="rounded-md border border-slate-200 p-3">
                      <div className="text-sm font-bold text-slate-900">{selected.name}</div>
                      <div className="text-xs text-slate-500">
                        {(selected.kind === "stool" ? 1 : selected.capacity)}p · {selected.zone || "Interior"} ·{" "}
                        {selected.kind === "stool" ? "Taburete" : "Mesa"}
                      </div>
                      {selected.notes ? <div className="mt-2 text-xs text-slate-600">{selected.notes}</div> : null}
                      <div className="mt-2 text-[11px] text-slate-500">
                        Actualizado: {new Date(selected.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-700">Estado</div>
                      <div className="flex flex-wrap gap-2">
                        {TABLE_STATUSES.map((s) => (
                          <button
                            key={`sel-${s.key}`}
                            onClick={() => setStatus(selected, s.key)}
                            className={`px-2 py-1 rounded-md text-xs font-semibold border ${
                              selected.status === s.key
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(selected)}
                      className="w-full px-3 py-2 rounded-md text-sm font-semibold border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      Borrar mesa
                    </button>
                  </>
                ) : null}

                {selectedWall ? (
                  <>
                    <div className="rounded-md border border-slate-200 p-3">
                      <div className="text-sm font-bold text-slate-900">{selectedWall.kind === "bar" ? "Barra" : "Pared"}</div>
                      <div className="text-xs text-slate-500">Bloquea zonas del mapa (no afecta al motor aún).</div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        Actualizado: {new Date(selectedWall.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-700">Diseño</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => rotateWall(selectedWall)}
                          className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
                        >
                          Rotar 90°
                        </button>
                        <button
                          onClick={() => resizeWall(selectedWall, selectedWall.w + 0.04, selectedWall.h)}
                          className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
                          title="Aumentar largo"
                        >
                          + Largo
                        </button>
                        <button
                          onClick={() => resizeWall(selectedWall, Math.max(0.02, selectedWall.w - 0.04), selectedWall.h)}
                          className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
                          title="Reducir largo"
                        >
                          - Largo
                        </button>
                        <button
                          onClick={() => resizeWall(selectedWall, selectedWall.w, selectedWall.h + 0.01)}
                          className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
                          title="Aumentar grosor"
                        >
                          + Grosor
                        </button>
                        <button
                          onClick={() => resizeWall(selectedWall, selectedWall.w, Math.max(0.01, selectedWall.h - 0.01))}
                          className="px-3 py-2 rounded-md text-sm font-semibold border border-slate-300 hover:bg-slate-100"
                          title="Reducir grosor"
                        >
                          - Grosor
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Tip: usa <span className="font-semibold">Rotar 90°</span> para cambiar el sentido (horizontal/vertical).
                      </div>
                    </div>
                    <button
                      onClick={() => removeWall(selectedWall)}
                      className="w-full px-3 py-2 rounded-md text-sm font-semibold border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      Borrar pared
                    </button>
                  </>
                ) : null}
              </>
            )}
          </aside>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([zoneName, list]) => (
            <section key={zoneName} className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-900 truncate">{zoneName}</div>
                <div className="text-xs text-slate-500">{list.length} mesas</div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {list.map((t) => (
                  <div key={t.id} className={`rounded-lg border p-3 ${statusColor(t.status)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{t.name}</div>
                        <div className="text-xs opacity-80">
                          {t.capacity}p · {statusLabel(t.status)}
                        </div>
                        {t.notes ? <div className="text-xs opacity-80 mt-1 truncate">{t.notes}</div> : null}
                      </div>
                      <button
                        onClick={() => remove(t)}
                        className="px-2 py-1 rounded-md text-xs font-semibold border border-slate-300 bg-white/70 hover:bg-white"
                        title="Borrar mesa"
                      >
                        Borrar
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TABLE_STATUSES.map((s) => (
                        <button
                          key={`${t.id}-${s.key}`}
                          onClick={() => setStatus(t, s.key)}
                          className={`px-2 py-1 rounded-md text-xs font-semibold border ${
                            t.status === s.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white/70 hover:bg-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] opacity-70">Actualizado: {new Date(t.updated_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default TablesLive;
