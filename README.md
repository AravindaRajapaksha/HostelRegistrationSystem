# Hostel System Frontend

This project is a React + Vite frontend for a hostel booking workflow with:

- student booking requests
- academic and warden approvals
- payment tracking
- QR generation
- QR scan history from the IoT scanner

The app currently still runs on local demo state in the browser. This repo now also includes the first Supabase database setup so we can move the website data into a real backend step by step.

## Supabase Files Added

- `supabase/website_schema.sql`: creates the website database tables
- `supabase/seed.sql`: inserts starter settings, rooms, demo users, demo bookings, and scan logs
- `.env.example`: shows the frontend environment variables
- `src/lib/supabase.js`: creates the frontend Supabase client

## Database Design

The initial website database includes these main tables:

- `hostel_settings`
- `departments`
- `profiles`
- `rooms`
- `booking_requests`
- `booking_review_logs`
- `booking_clearances`
- `qr_scan_logs`

This structure matches the current frontend data model:

- `profiles` stores students, wardens, sub-wardens, and academic staff
- `booking_requests` stores booking form submissions and approval/payment fields
- `qr_scan_logs` stores QR scan confirmations from the scanner side

## How To Set Up Supabase

1. Create a new Supabase project.
2. Open the Supabase SQL Editor.
3. Run `supabase/website_schema.sql`.
4. Run `supabase/seed.sql`.
5. Copy `.env.example` to `.env`.
6. Fill in:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

7. Start the frontend:

```bash
npm run dev
```

## Important Note

The UI is not switched over to live Supabase queries yet. Right now:

- the website still uses local demo state from `src/data.js`
- the database schema and frontend Supabase client are ready
- the next step is replacing local state reads/writes with Supabase reads/writes

## Suggested Next Step

After this database setup, the next clean step is:

1. connect login/profile loading to `profiles`
2. connect booking creation to `booking_requests`
3. connect QR scan history to `qr_scan_logs`
