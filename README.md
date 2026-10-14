# 360 Photobooth

One app for the whole flow: a guest enters their name, the camera counts down 3-2-1, records 10 seconds (the last 5 in slow motion), uploads it to Supabase, and a QR code on the same screen lets them download it.

- `/`: registration, then camera, then QR code (run it on an iPad or phone)
- `/v`: page the QR code opens; waits for the upload, then shows the video and a download button

Built with Next.js (App Router, TypeScript) and Supabase (Storage and Postgres).

## Setup

1. In the Supabase SQL Editor, run `supabase/setup.sql`.
2. Copy `.env.example` to `.env.local` and fill in your project URL and anon key (Supabase > Project Settings > API).
3. `npm install`, then `npm run dev` and open http://localhost:3000.

## Deploy on Vercel

1. Import this GitHub repo in Vercel.
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or the `NEXT_PUBLIC_` versions) under Settings > Environment Variables.
3. Deploy, then open the app on the iPad (the camera needs HTTPS, which Vercel provides).

Guest names are stored in the `sessions` table; view them in the Supabase dashboard.
