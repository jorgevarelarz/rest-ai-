<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1EqJNlqGtM2SQpNCuQo52dyZ9t0WdquPY

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
   Optional for owner panel login (backend auth):
   - `OWNER_USER=admin`
   - `OWNER_PASSWORD=admin`
   - `OWNER_AUTH_SECRET=change-this-secret`
   Optional for Google Calendar sync:
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
   - `GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback`
   - `GOOGLE_CALENDAR_ID=primary` (optional)
3. Run the app:
   `npm run dev`

## Commercial Website + Demo Routes

- `/#/home` (or no hash): commercial website for prospects
- `/#/app`: live demo chat
- `/#/owner`: owner/admin panel

Branding values are centralized in:
- `src/marketing/siteConfig.ts`

## Deploy on Vercel

1. Push this project to GitHub.
2. In Vercel, import the repo.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables:
   - `VITE_GEMINI_API_KEY`
   - `OWNER_USER`, `OWNER_PASSWORD`, `OWNER_AUTH_SECRET`
   - Optional calendar sync:
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
     - `GOOGLE_REDIRECT_URI=https://<tu-dominio>/api/calendar/callback`
     - `GOOGLE_CALENDAR_ID=primary`
