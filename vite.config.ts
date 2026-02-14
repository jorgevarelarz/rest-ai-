import path from 'path';
import crypto from 'crypto';
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
        },
        configurePreviewServer(server) {
          server.middlewares.use(authMiddleware);
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
