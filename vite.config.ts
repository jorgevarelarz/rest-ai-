import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const geminiKey =
    env.VITE_GEMINI_API_KEY ||
    env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    '';
  const ownerUser = (
    env.OWNER_USER ||
    env.VITE_OWNER_USER ||
    process.env.OWNER_USER ||
    process.env.VITE_OWNER_USER ||
    'admin'
  ).trim();
  const ownerPassword = (
    env.OWNER_PASSWORD ||
    env.VITE_OWNER_PASSWORD ||
    process.env.OWNER_PASSWORD ||
    process.env.VITE_OWNER_PASSWORD ||
    'admin'
  ).trim();
  const ownerSecret = (
    env.OWNER_AUTH_SECRET ||
    process.env.OWNER_AUTH_SECRET ||
    'dev-only-owner-secret'
  ).trim();
  const frontendOrigin = (
    env.FRONTEND_ORIGIN ||
    process.env.FRONTEND_ORIGIN ||
    ""
  ).trim().replace(/\/+$/, "");
  const cookieDomain = (
    env.OWNER_COOKIE_DOMAIN ||
    process.env.OWNER_COOKIE_DOMAIN ||
    ""
  ).trim();
  const ownerCookieSecureRaw = (
    env.OWNER_COOKIE_SECURE ||
    process.env.OWNER_COOKIE_SECURE ||
    "true"
  ).trim().toLowerCase();
  const ownerCookieSecure = ownerCookieSecureRaw === "true";
  const ownerCookieSameSiteRaw = (
    env.OWNER_COOKIE_SAMESITE ||
    process.env.OWNER_COOKIE_SAMESITE ||
    (ownerCookieSecure ? "none" : "lax")
  ).trim().toLowerCase();
  const ownerCookieSameSite =
    ownerCookieSameSiteRaw === "strict"
      ? "Strict"
      : ownerCookieSameSiteRaw === "none"
        ? "None"
        : "Lax";

  const cookieName = 'owner_session';
  const maxAgeSeconds = 60 * 60 * 8; // 8h
  const tablesDataPath = path.resolve(__dirname, ".data", "tables_v1.json");
  const googleClientId = (env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientSecret = (env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const googleRedirectUri = (env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || '').trim();
  const googleDefaultCalendarId = (env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || 'primary').trim();
  const googleOauthDataPath = path.resolve(__dirname, ".data", "google_calendar_oauth_v1.json");

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

  const allowedOrigins = new Set<string>([
    frontendOrigin,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ].filter(Boolean));

  const applyCors = (req: any, res: any): void => {
    const origin = String(req.headers?.origin || "").trim();
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    const reqHeaders = String(req.headers?.["access-control-request-headers"] || "").trim();
    res.setHeader("Access-Control-Allow-Headers", reqHeaders || "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  };

  const apiCorsMiddleware = (req: any, res: any, next: any) => {
    const url = String(req.url || "");
    if (!url.startsWith("/api/")) return next();
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    return next();
  };

  const setSessionCookie = (token: string): string => {
    const parts = [
      `${cookieName}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      `SameSite=${ownerCookieSameSite}`,
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (ownerCookieSecure) parts.push("Secure");
    if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
    return parts.join("; ");
  };

  const clearSessionCookie = (): string => {
    const parts = [
      `${cookieName}=`,
      "Path=/",
      "HttpOnly",
      `SameSite=${ownerCookieSameSite}`,
      "Max-Age=0",
    ];
    if (ownerCookieSecure) parts.push("Secure");
    if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
    return parts.join("; ");
  };

  const buildOwnerRedirectUrl = (params: Record<string, string>): string => {
    const base = frontendOrigin ? `${frontendOrigin}/#/owner` : "/#/owner";
    const qs = new URLSearchParams(params).toString();
    return qs ? `${base}?${qs}` : base;
  };

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

  type GoogleTokens = {
    refresh_token: string;
    access_token?: string;
    expiry_date?: number;
    scope?: string;
    token_type?: string;
    email?: string;
    calendar_id?: string;
    connected_at?: number;
  };

  type GoogleOAuthStore = Record<string, GoogleTokens>;
  const oauthStateByNonce = new Map<string, { rid: string; createdAt: number }>();

  const isGoogleConfigured = (): boolean =>
    Boolean(googleClientId && googleClientSecret && googleRedirectUri);

  const loadGoogleStore = (): GoogleOAuthStore => {
    try {
      if (!fs.existsSync(googleOauthDataPath)) return {};
      const raw = fs.readFileSync(googleOauthDataPath, "utf8");
      const parsed = JSON.parse(raw) as GoogleOAuthStore;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveGoogleStore = (data: GoogleOAuthStore) => {
    try {
      ensureDir(path.dirname(googleOauthDataPath));
      fs.writeFileSync(googleOauthDataPath, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // no-op
    }
  };

  const buildOAuthState = (rid: string): string => {
    const nonce = crypto.randomBytes(16).toString("hex");
    oauthStateByNonce.set(nonce, { rid, createdAt: Date.now() });
    return nonce;
  };

  const consumeOAuthState = (nonce: string): string | null => {
    const item = oauthStateByNonce.get(nonce);
    if (!item) return null;
    oauthStateByNonce.delete(nonce);
    if (Date.now() - item.createdAt > 10 * 60_000) return null;
    return item.rid;
  };

  const toErrorMessage = async (resp: Response): Promise<string> => {
    try {
      const txt = await resp.text();
      return txt || `HTTP_${resp.status}`;
    } catch {
      return `HTTP_${resp.status}`;
    }
  };

  const exchangeCodeForTokens = async (code: string): Promise<any> => {
    const body = new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: "authorization_code",
    });
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) {
      throw new Error(await toErrorMessage(resp));
    }
    return await resp.json();
  };

  const refreshAccessToken = async (refreshToken: string): Promise<any> => {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      grant_type: "refresh_token",
    });
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) {
      throw new Error(await toErrorMessage(resp));
    }
    return await resp.json();
  };

  const fetchGoogleUserEmail = async (accessToken: string): Promise<string | undefined> => {
    try {
      const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) return undefined;
      const body = (await resp.json()) as { email?: string };
      return body.email;
    } catch {
      return undefined;
    }
  };

  const getValidAccessToken = async (rid: string): Promise<string | null> => {
    const store = loadGoogleStore();
    const entry = store[rid];
    if (!entry?.refresh_token) return null;

    const now = Date.now();
    if (entry.access_token && entry.expiry_date && now < entry.expiry_date - 30_000) {
      return entry.access_token;
    }

    try {
      const refreshed = await refreshAccessToken(entry.refresh_token);
      const access = String(refreshed.access_token || "").trim();
      if (!access) return null;
      const expiresInSec = Number(refreshed.expires_in || 3600);
      store[rid] = {
        ...entry,
        access_token: access,
        expiry_date: now + Math.max(60, expiresInSec) * 1000,
        scope: refreshed.scope || entry.scope,
        token_type: refreshed.token_type || entry.token_type || "Bearer",
      };
      saveGoogleStore(store);
      return access;
    } catch {
      return null;
    }
  };

  const parseReservationStartEndIso = (
    dateRaw: string,
    timeRaw: string,
    durationMin = 90
  ): { startIso: string; endIso: string } | null => {
    const date = String(dateRaw || "").trim();
    const time = String(timeRaw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (!/^\d{1,2}:\d{2}$/.test(time)) return null;
    const start = new Date(`${date}T${time}:00`);
    if (!Number.isFinite(start.getTime())) return null;
    const end = new Date(start.getTime() + durationMin * 60_000);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  };

  const buildCalendarEventPayload = (input: {
    reservation: any;
    restaurantName: string;
    businessType: "hospitality" | "professional_services";
  }) => {
    const r = input.reservation || {};
    const window = parseReservationStartEndIso(r.date, r.time, 90);
    if (!window) return null;
    const party = Number(r.partySize || 0);
    const label = input.businessType === "professional_services" ? "Cita" : "Reserva";
    const summary = `${label}: ${r.name || "Cliente"}${Number.isFinite(party) && party > 0 ? ` (${party})` : ""}`;
    const notes: string[] = [];
    notes.push(`Negocio: ${input.restaurantName}`);
    notes.push(`Cliente: ${r.name || "-"}`);
    notes.push(`Teléfono: ${r.phone || "-"}`);
    notes.push(`Fecha: ${r.date || "-"} ${r.time || "-"}`);
    if (Number.isFinite(party) && party > 0) notes.push(`Personas: ${party}`);
    if (r.table_id) notes.push(`Mesa/Recurso: ${r.table_id}`);
    if (r.notes) notes.push(`Notas: ${r.notes}`);
    notes.push(`Reserva ID: ${r.id || "-"}`);
    return {
      summary,
      description: notes.join("\n"),
      start: { dateTime: window.startIso },
      end: { dateTime: window.endIso },
    };
  };

  const upsertGoogleCalendarEvent = async (
    rid: string,
    reservation: any,
    restaurantName: string,
    businessType: "hospitality" | "professional_services"
  ): Promise<{ event_id?: string }> => {
    const accessToken = await getValidAccessToken(rid);
    if (!accessToken) return {};
    const store = loadGoogleStore();
    const calendarId = store[rid]?.calendar_id || googleDefaultCalendarId;
    const payload = buildCalendarEventPayload({ reservation, restaurantName, businessType });
    if (!payload) return {};
    const existingEventId = String(reservation?.calendar_event_id || "").trim();
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    if (existingEventId) {
      const resp = await fetch(`${base}/${encodeURIComponent(existingEventId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return { event_id: existingEventId };
    }

    const createResp = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!createResp.ok) return {};
    const created = (await createResp.json()) as { id?: string };
    return { event_id: created.id };
  };

  const cancelGoogleCalendarEvent = async (rid: string, eventId: string): Promise<void> => {
    const accessToken = await getValidAccessToken(rid);
    if (!accessToken) return;
    const store = loadGoogleStore();
    const calendarId = store[rid]?.calendar_id || googleDefaultCalendarId;
    if (!eventId) return;
    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
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

  const calendarMiddleware = async (req: any, res: any, next: any) => {
    const url = req.url || "";
    if (!url.startsWith("/api/calendar/")) return next();
    const { path: pathname, query } = parseUrl(url);

    if (req.method === "GET" && pathname === "/api/calendar/status") {
      const auth = requireOwner(req);
      if (!auth.ok) return json(res, 401, { error: "unauthorized" });
      const rid = String(query.get("rid") || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });
      const hasConfig = isGoogleConfigured();
      const store = loadGoogleStore();
      const entry = store[rid];
      return json(res, 200, {
        connected: Boolean(entry?.refresh_token),
        email: entry?.email,
        calendar_id: entry?.calendar_id || googleDefaultCalendarId,
        has_config: hasConfig,
      });
    }

    if (req.method === "GET" && pathname === "/api/calendar/connect") {
      const auth = requireOwner(req);
      if (!auth.ok) {
        res.statusCode = 401;
        res.end("unauthorized");
        return;
      }
      if (!isGoogleConfigured()) {
        res.statusCode = 400;
        res.end("google_oauth_not_configured");
        return;
      }
      const rid = String(query.get("rid") || "").trim();
      if (!rid) {
        res.statusCode = 400;
        res.end("rid_required");
        return;
      }
      const state = buildOAuthState(rid);
      const params = new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: googleRedirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
        state,
      });
      res.statusCode = 302;
      res.setHeader("Location", `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/api/calendar/callback") {
      if (!isGoogleConfigured()) {
        res.statusCode = 400;
        res.end("google_oauth_not_configured");
        return;
      }
      const code = String(query.get("code") || "").trim();
      const state = String(query.get("state") || "").trim();
      const error = String(query.get("error") || "").trim();
      if (error) {
        res.statusCode = 302;
        res.setHeader("Location", buildOwnerRedirectUrl({ calendar: error }));
        res.end();
        return;
      }
      if (!code || !state) {
        res.statusCode = 400;
        res.end("invalid_oauth_callback");
        return;
      }
      const rid = consumeOAuthState(state);
      if (!rid) {
        res.statusCode = 400;
        res.end("invalid_state");
        return;
      }
      try {
        const tokens = await exchangeCodeForTokens(code);
        const refreshToken = String(tokens.refresh_token || "").trim();
        const accessToken = String(tokens.access_token || "").trim();
        if (!refreshToken && !accessToken) {
          throw new Error("missing_tokens");
        }
        const store = loadGoogleStore();
        const prev = store[rid] || ({} as GoogleTokens);
        const expiresIn = Number(tokens.expires_in || 3600);
        const email = accessToken ? await fetchGoogleUserEmail(accessToken) : prev.email;
        store[rid] = {
          ...prev,
          refresh_token: refreshToken || prev.refresh_token,
          access_token: accessToken || prev.access_token,
          expiry_date: accessToken ? Date.now() + Math.max(60, expiresIn) * 1000 : prev.expiry_date,
          scope: tokens.scope || prev.scope,
          token_type: tokens.token_type || prev.token_type || "Bearer",
          email: email || prev.email,
          calendar_id: prev.calendar_id || googleDefaultCalendarId,
          connected_at: Date.now(),
        };
        saveGoogleStore(store);
        res.statusCode = 302;
        res.setHeader("Location", buildOwnerRedirectUrl({ rid, calendar: "connected" }));
        res.end();
      } catch {
        res.statusCode = 302;
        res.setHeader("Location", buildOwnerRedirectUrl({ rid, calendar: "error" }));
        res.end();
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/calendar/disconnect") {
      const auth = requireOwner(req);
      if (!auth.ok) return json(res, 401, { error: "unauthorized" });
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      if (!rid) return json(res, 400, { error: "rid_required" });
      const store = loadGoogleStore();
      if (store[rid]) {
        delete store[rid];
        saveGoogleStore(store);
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && pathname === "/api/calendar/create_reservation_event") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const reservation = payload.reservation || null;
      const restaurantName = String(payload.restaurant_name || "").trim() || "Negocio";
      const businessType =
        payload.business_type === "professional_services" ? "professional_services" : "hospitality";
      if (!rid || !reservation) return json(res, 400, { error: "invalid_payload" });
      const result = await upsertGoogleCalendarEvent(rid, reservation, restaurantName, businessType);
      return json(res, 200, result);
    }

    if (req.method === "POST" && pathname === "/api/calendar/update_reservation_event") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const reservation = payload.reservation || null;
      const restaurantName = String(payload.restaurant_name || "").trim() || "Negocio";
      const businessType =
        payload.business_type === "professional_services" ? "professional_services" : "hospitality";
      if (!rid || !reservation) return json(res, 400, { error: "invalid_payload" });
      const result = await upsertGoogleCalendarEvent(rid, reservation, restaurantName, businessType);
      return json(res, 200, result);
    }

    if (req.method === "POST" && pathname === "/api/calendar/cancel_reservation_event") {
      const bodyRaw = await readBody(req);
      let payload: any = {};
      try {
        payload = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return json(res, 400, { error: "invalid_json" });
      }
      const rid = String(payload.rid || "").trim();
      const reservation = payload.reservation || {};
      const eventId = String(reservation.calendar_event_id || "").trim();
      if (!rid || !eventId) return json(res, 200, { ok: true });
      await cancelGoogleCalendarEvent(rid, eventId);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not_found" });
  };

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    preview: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: true,
      allowedHosts: true,
    },
    plugins: [
      react(),
      {
        name: 'owner-auth-api',
        configureServer(server) {
          server.middlewares.use(apiCorsMiddleware);
          server.middlewares.use(authMiddleware);
          loadTablesFromDisk();
          server.middlewares.use(tablesMiddleware);
          server.middlewares.use(calendarMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(apiCorsMiddleware);
          server.middlewares.use(authMiddleware);
          loadTablesFromDisk();
          server.middlewares.use(tablesMiddleware);
          server.middlewares.use(calendarMiddleware);
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
