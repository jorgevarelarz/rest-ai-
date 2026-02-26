# Railway (Backend) + Vercel (Frontend)

## 1) Vercel (frontend)
Set:

- `VITE_BACKEND_URL=https://<tu-backend-railway>.up.railway.app`
- `VITE_GEMINI_API_KEY` (si aplica en frontend)

## 2) Railway (backend)
Set:

- `FRONTEND_ORIGIN=https://restobot-ai-8.vercel.app`
- `OWNER_AUTH_SECRET=<secreto-fuerte>`
- `OWNER_USER=<usuario>`
- `OWNER_PASSWORD=<password>`
- `OWNER_COOKIE_SECURE=true`
- `OWNER_COOKIE_SAMESITE=none`
- `OWNER_COOKIE_DOMAIN` (opcional; deja vacío para host-only cookie)
- `GOOGLE_REDIRECT_URI=https://<tu-backend-railway>.up.railway.app/api/calendar/callback`

## 3) Expected behavior

- Frontend calls Railway API using `VITE_BACKEND_URL`.
- Railway allows CORS with credentials from `FRONTEND_ORIGIN`.
- Owner session cookie works cross-site (`Secure` + `SameSite=None`).
- Google Calendar callback redirects back to `/#/owner` in frontend domain.
