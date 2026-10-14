# 360 Photobooth

A guest registers on one device, a second device counts down 3-2-1, records 10 seconds (the last 5 in slow motion), uploads it to Supabase, and the guest scans a QR code to download it.

- `/register`: registration + Start Capture + QR code (phone or iPad)
- `/camera`: the camera (iPad or phone, needs HTTPS)
- `/v`: page the QR code opens; waits for the upload, then shows the video and a download button

Built with Next.js (App Router, TypeScript) and Supabase (Storage, Postgres, Realtime broadcast).

## Setup

1. In the Supabase SQL Editor, run `supabase/setup.sql`.
2. Copy `.env.example` to `.env.local` and fill in your project URL and anon key (Supabase > Project Settings > API).
3. `npm install`, then `npm run dev` and open http://localhost:3000.

## Deploy on Vercel

1. Import this GitHub repo in Vercel.
2. Add the four `NEXT_PUBLIC_*` variables from `.env.example` under Settings > Environment Variables.
3. Deploy. Use `https://<your-app>.vercel.app/camera` and `/register` on your devices.

Guest names are stored in the `sessions` table; view them in the Supabase dashboard.
