import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const geminiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  const ownerUser = (env.OWNER_USER || env.VITE_OWNER_USER || 'admin').trim();
  const ownerPassword = (env.OWNER_PASSWORD || env.VITE_OWNER_PASSWORD || 'admin').trim();
  const ownerSecret = (env.OWNER_AUTH_SECRET || 'dev-only-owner-secret').trim();

  const cookieName = 'owner_session';
  const maxAgeSeconds = 60 * 60 * 8; // 8h
  const tablesDataPath = path.resolve(__dirname, ".data", "tables_v1.json");

  const base64url = (v: string): string => Buffer.from(v).toString('base64url');
  const sign = (payloadB64: string): string =>
    crypto.createHmac('sha256', ownerSecret).update(payloadB64).digest('base64url');

  const createToken = (username: string): string => {
    const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
    const payload = base64url(JSON.stringify({ u: username, exp }));
    const sig = sign(payload);
    return `${payload}.${sig}`;
  };

  const verifyToken = (token?: string): { authenticated: boolean; username?: string } => {
    if (!token || !token.includes('.')) return { authenticated: false };
    const [payload, sig] = token.split('.', 2);
    if (!payload || !sig) return { authenticated: false };
    const expectedSig = sign(payload);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return { authenticated: false };
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return { authenticated: false };
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; exp?: number };
      if (!data?.u || !data?.exp) return { authenticated: false };
      if (Date.now() / 1000 > data.exp) return { authenticated: false };
      return { authenticated: true, username: data.u };
    } catch {
      return { authenticated: false };
    }
  };

  const parseCookies = (cookieHeader?: string): Record<string, string> => {
    if (!cookieHeader) return {};
    const out: Record<string, string> = {};
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (!k || rest.length === 0) continue;
      out[k] = decodeURIComponent(rest.join('='));
    }
    return out;
  };

  const readBody = async (req: any): Promise<string> => {
    return await new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => resolve(body));
      req.on('error', () => resolve(''));
    });
  };

  const json = (res: any, statusCode: number, body: unknown, cookies?: string[]) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (cookies && cookies.length) {
      res.setHeader('Set-Cookie', cookies);
    }
    res.end(JSON.stringify(body));
  };

  const setSessionCookie = (token: string): string =>
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

  const clearSessionCookie = (): string =>
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

  const authMiddleware = async (req: any, res: any, next: any) => {
    const url = req.url || '';
    if (!url.startsWith('/api/auth/')) return next();

    if (req.method === 'GET' && url.startsWith('/api/auth/session')) {
      const cookies = parseCookies(req.headers.cookie);
      const session = verifyToken(cookies[cookieName]);
      return json(res, 200, session);
    }

    if (req.method === 'POST' && url.startsWith('/api/auth/login')) {
      const bodyRaw = await readBody(req);
      let payload: { username?: string; password?: string } = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { authenticated: false, error: 'invalid_json' });
      }

      const username = (payload.username || '').trim();
      const password = payload.password || '';
      if (username !== ownerUser || password !== ownerPassword) {
        return json(res, 401, { authenticated: false });
      }
      const token = createToken(username);
      return json(res, 200, { authenticated: true, username }, [setSessionCookie(token)]);
    }

    if (req.method === 'POST' && url.startsWith('/api/auth/logout')) {
      return json(res, 200, { ok: true }, [clearSessionCookie()]);
    }

    return json(res, 404, { error: 'not_found' });
  };

  const ensureDir = (dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch {
      // no-op
    }
  };

  type TableStatus = "free" | "occupied" | "reserved" | "blocked";
  type RestaurantTable = {
    id: string;
    restaurant_id: string;
    name: string;
    capacity: number;
    zone?: string;
    kind?: "table" | "stool";
    status: TableStatus;
    layout_x?: number;
    layout_y?: number;
    notes?: string;
    updated_at: number;
  };

  type RestaurantLayoutWall = {
    id: string;
    restaurant_id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: "wall" | "bar";
    updated_at: number;
  };

  const generateId = () => Math.random().toString(36).slice(2, 11);

  const tablesByRestaurant = new Map<string, RestaurantTable[]>();
  const wallsByRestaurant = new Map<string, RestaurantLayoutWall[]>();
  const sseClientsByRestaurant = new Map<string, Set<any>>();

  const loadTablesFromDisk = () => {
    try {
      if (!fs.existsSync(tablesDataPath)) return;
      const raw = fs.readFileSync(tablesDataPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, any>;
      for (const [rid, value] of Object.entries(parsed || {})) {
        if (Array.isArray(value)) {
          // v1 format: rid -> tables[]
          tablesByRestaurant.set(rid, value);
          wallsByRestaurant.set(rid, []);
          continue;
        }
        if (value && typeof value === "object") {
          const tables = Array.isArray(value.tables) ? value.tables : [];
          const walls = Array.isArray(value.walls) ? value.walls : [];
          tablesByRestaurant.set(rid, tables);
          wallsByRestaurant.set(rid, walls);
          continue;
        }
      }
    } catch {
      // ignore
    }
  };

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSaveTables = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        ensureDir(path.dirname(tablesDataPath));
        const obj: Record<string, { tables: RestaurantTable[]; walls: RestaurantLayoutWall[] }> = {};
        for (const [rid, tables] of tablesByRestaurant.entries()) {
          obj[rid] = { tables, walls: wallsByRestaurant.get(rid) ?? [] };
        }
        fs.writeFileSync(tablesDataPath, JSON.stringify(obj, null, 2), "utf8");
      } catch {
        // ignore
      }
    }, 150);
  };

  const broadcastTables = (rid: string) => {
    const clients = sseClientsByRestaurant.get(rid);
    if (!clients || clients.size === 0) return;
    const payload = JSON.stringify({
      tables: tablesByRestaurant.get(rid) ?? [],
      walls: wallsByRestaurant.get(rid) ?? [],
    });
    for (const res of clients) {
      try {
        res.write(`event: tables\n`);
        res.write(`data: ${payload}\n\n`);
      } catch {
        // ignore
      }
    }
  };

  const requireOwner = (req: any): { ok: true; username: string } | { ok: false } => {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifyToken(cookies[cookieName]);
    if (!session.authenticated || !session.username) return { ok: false };
    return { ok: true, username: session.username };
  };

  const parseUrl = (reqUrl: string): { path: string; query: URLSearchParams } => {
    const u = new URL(reqUrl, "http://local");
    return { path: u.pathname, query: u.searchParams };
  };

  const tablesMiddleware = async (req: any, res: any, next: any) => {
    const url = req.url || "";
    if (!url.startsWith("/api/tables/")) return next();

    const auth = requireOwner(req);
    if (!auth.ok) return json(res, 401, { error: "unauthorized" });

    const { path: pathname, query } = parseUrl(url);

    if (req.method === "GET" && pathname === "/api/tables/state") {
      const rid = (query.get("rid") || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });
      return json(res, 200, { tables: tablesByRestaurant.get(rid) ?? [], walls: wallsByRestaurant.get(rid) ?? [] });
    }

    if (req.method === "GET" && pathname === "/api/tables/stream") {
      const rid = (query.get("rid") || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const set = sseClientsByRestaurant.get(rid) ?? new Set<any>();
      set.add(res);
      sseClientsByRestaurant.set(rid, set);

      // Initial payload.
      const payload = JSON.stringify({ tables: tablesByRestaurant.get(rid) ?? [], walls: wallsByRestaurant.get(rid) ?? [] });
      res.write(`event: tables\n`);
      res.write(`data: ${payload}\n\n`);

      const ping = setInterval(() => {
        try {
          res.write(`event: ping\n`);
          res.write(`data: {}\n\n`);
        } catch {
          // ignore
        }
      }, 25_000);

      req.on("close", () => {
        clearInterval(ping);
        const clients = sseClientsByRestaurant.get(rid);
        if (clients) {
          clients.delete(res);
          if (clients.size === 0) sseClientsByRestaurant.delete(rid);
        }
      });

      return;
    }

    if (req.method === "POST" && pathname === "/api/tables/create") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const name = String(payload.name || "").trim();
      const zone = payload.zone ? String(payload.zone).trim() : undefined;
      const notes = payload.notes ? String(payload.notes).trim() : undefined;
      const kindRaw = String(payload.kind || "table");
      const kind = (kindRaw === "stool" ? "stool" : "table") as "table" | "stool";
      const capacity = kind === "stool" ? 1 : Number(payload.capacity);
      if (!rid) return json(res, 400, { error: "rid_required" });
      if (!name) return json(res, 400, { error: "name_required" });
      if (!Number.isFinite(capacity) || capacity < 1) return json(res, 400, { error: "capacity_invalid" });
      const nowMs = Date.now();
      const list = (tablesByRestaurant.get(rid) ?? []).slice();
      const idx = list.length;
      // Default auto-layout: place new tables in a grid.
      const cols = 6;
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const layout_x = (col + 1) / (cols + 1);
      const layout_y = (row + 1) / (cols + 1);
      list.push({
        id: generateId(),
        restaurant_id: rid,
        name,
        capacity: Math.trunc(capacity),
        zone,
        kind,
        notes,
        status: "free",
        layout_x,
        layout_y,
        updated_at: nowMs,
      });
      tablesByRestaurant.set(rid, list);
      if (!wallsByRestaurant.has(rid)) wallsByRestaurant.set(rid, []);
      scheduleSaveTables();
      broadcastTables(rid);
      return json(res, 200, { tables: list, walls: wallsByRestaurant.get(rid) ?? [] });
    }

    if (req.method === "POST" && pathname === "/api/tables/patch") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const tableId = String(payload.table_id || "").trim();
      const patch = payload.patch || {};
      if (!rid) return json(res, 400, { error: "rid_required" });
      if (!tableId) return json(res, 400, { error: "table_id_required" });

      const list = (tablesByRestaurant.get(rid) ?? []).slice();
      const idx = list.findIndex((t) => t.id === tableId);
      if (idx === -1) return json(res, 404, { error: "not_found" });

      const next: RestaurantTable = { ...list[idx] };
      if (patch.name !== undefined) next.name = String(patch.name).trim();
      if (patch.zone !== undefined) next.zone = String(patch.zone).trim() || undefined;
      if (patch.notes !== undefined) next.notes = String(patch.notes).trim() || undefined;
      if (patch.kind !== undefined) {
        const k = String(patch.kind);
        if (k !== "table" && k !== "stool") return json(res, 400, { error: "kind_invalid" });
        next.kind = k as any;
        if (next.kind === "stool") next.capacity = 1;
      }
      if (patch.capacity !== undefined) {
        const cap = Number(patch.capacity);
        if (!Number.isFinite(cap) || cap < 1) return json(res, 400, { error: "capacity_invalid" });
        next.capacity = (next.kind === "stool" ? 1 : Math.trunc(cap));
      }
      if (patch.status !== undefined) {
        const s = String(patch.status) as TableStatus;
        if (s !== "free" && s !== "occupied" && s !== "reserved" && s !== "blocked") {
          return json(res, 400, { error: "status_invalid" });
        }
        next.status = s;
      }
      if (patch.layout_x !== undefined) {
        const x = Number(patch.layout_x);
        if (!Number.isFinite(x) || x < 0 || x > 1) return json(res, 400, { error: "layout_x_invalid" });
        next.layout_x = x;
      }
      if (patch.layout_y !== undefined) {
        const y = Number(patch.layout_y);
        if (!Number.isFinite(y) || y < 0 || y > 1) return json(res, 400, { error: "layout_y_invalid" });
        next.layout_y = y;
      }
      if (!next.name) return json(res, 400, { error: "name_required" });
      next.updated_at = Date.now();

      list[idx] = next;
      tablesByRestaurant.set(rid, list);
      if (!wallsByRestaurant.has(rid)) wallsByRestaurant.set(rid, []);
      scheduleSaveTables();
      broadcastTables(rid);
      return json(res, 200, { tables: list, walls: wallsByRestaurant.get(rid) ?? [] });
    }

    if (req.method === "POST" && pathname === "/api/tables/delete") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const tableId = String(payload.table_id || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });
      if (!tableId) return json(res, 400, { error: "table_id_required" });

      const list = (tablesByRestaurant.get(rid) ?? []).slice();
      const next = list.filter((t) => t.id !== tableId);
      tablesByRestaurant.set(rid, next);
      if (!wallsByRestaurant.has(rid)) wallsByRestaurant.set(rid, []);
      scheduleSaveTables();
      broadcastTables(rid);
      return json(res, 200, { tables: next, walls: wallsByRestaurant.get(rid) ?? [] });
    }

    if (req.method === "POST" && pathname === "/api/tables/wall_create") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });
      const kindRaw = String(payload.kind || "wall");
      const kind = (kindRaw === "bar" ? "bar" : "wall") as "wall" | "bar";
      const x = Number(payload.x);
      const y = Number(payload.y);
      const w = Number(payload.w);
      const h = Number(payload.h);
      const valid01 = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
      if (!valid01(x) || !valid01(y) || !valid01(w) || !valid01(h)) return json(res, 400, { error: "rect_invalid" });
      const nowMs = Date.now();
      const walls = (wallsByRestaurant.get(rid) ?? []).slice();
      walls.push({ id: generateId(), restaurant_id: rid, x, y, w, h, kind, updated_at: nowMs });
      wallsByRestaurant.set(rid, walls);
      if (!tablesByRestaurant.has(rid)) tablesByRestaurant.set(rid, []);
      scheduleSaveTables();
      broadcastTables(rid);
      return json(res, 200, { walls, tables: tablesByRestaurant.get(rid) ?? [] });
    }

    if (req.method === "POST" && pathname === "/api/tables/wall_patch") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const wallId = String(payload.wall_id || "").trim();
      const patch = payload.patch || {};
      if (!rid) return json(res, 400, { error: "rid_required" });
      if (!wallId) return json(res, 400, { error: "wall_id_required" });
      const walls = (wallsByRestaurant.get(rid) ?? []).slice();
      const idx = walls.findIndex((w) => w.id === wallId);
      if (idx === -1) return json(res, 404, { error: "not_found" });
      const next: RestaurantLayoutWall = { ...walls[idx] };
      const valid01 = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
      if (patch.x !== undefined) {
        const v = Number(patch.x);
        if (!valid01(v)) return json(res, 400, { error: "x_invalid" });
        next.x = v;
      }
      if (patch.y !== undefined) {
        const v = Number(patch.y);
        if (!valid01(v)) return json(res, 400, { error: "y_invalid" });
        next.y = v;
      }
      if (patch.w !== undefined) {
        const v = Number(patch.w);
        if (!valid01(v)) return json(res, 400, { error: "w_invalid" });
        next.w = v;
      }
      if (patch.h !== undefined) {
        const v = Number(patch.h);
        if (!valid01(v)) return json(res, 400, { error: "h_invalid" });
        next.h = v;
      }
      next.updated_at = Date.now();
      walls[idx] = next;
      wallsByRestaurant.set(rid, walls);
      if (!tablesByRestaurant.has(rid)) tablesByRestaurant.set(rid, []);
      scheduleSaveTables();
      broadcastTables(rid);
      return json(res, 200, { walls, tables: tablesByRestaurant.get(rid) ?? [] });
    }

    if (req.method === "POST" && pathname === "/api/tables/wall_delete") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const wallId = String(payload.wall_id || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });
      if (!wallId) return json(res, 400, { error: "wall_id_required" });
      const walls = (wallsByRestaurant.get(rid) ?? []).slice();
      const next = walls.filter((w) => w.id !== wallId);
      wallsByRestaurant.set(rid, next);
      if (!tablesByRestaurant.has(rid)) tablesByRestaurant.set(rid, []);
      scheduleSaveTables();
      broadcastTables(rid);
      return json(res, 200, { walls: next, tables: tablesByRestaurant.get(rid) ?? [] });
    }

    return json(res, 404, { error: "not_found" });
  };

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'owner-auth-api',
        configureServer(server) {
          server.middlewares.use(authMiddleware);
          loadTablesFromDisk();
          server.middlewares.use(tablesMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(authMiddleware);
          loadTablesFromDisk();
          server.middlewares.use(tablesMiddleware);
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(geminiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
