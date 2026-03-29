# Hostel System Frontend

This project is a React + Vite frontend for a hostel booking workflow with:

- student booking requests
- academic and warden approvals
- payment tracking
- QR generation
- QR scan history from the IoT scanner

The app can now run with live Supabase-backed data for bookings, approvals, payments, clearances, and QR scan history. It also supports connecting the ESP32-CAM scanner log to the warden QR confirmation page.

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
VITE_IOT_LOG_URL=http://192.168.1.50/view-log
```

`VITE_IOT_LOG_URL` is optional, but recommended if you want the website to connect to the ESP32-CAM scanner log automatically without pasting the `/view-log` URL each time. Use a fixed IP address or DHCP reservation for the ESP32-CAM so this URL stays stable.

When this URL is configured, the website can:

- read `/view-log` to import QR scan confirmations into the warden page
- sync approved-and-paid booking QR values into the ESP32 `users.txt` access list without changing the firmware

7. Start the frontend:

```bash
npm run dev
```

## Important Note

The ESP32-CAM firmware still decides whether to open by checking its local `users.txt` file. The website now helps keep that file in sync by pushing approved-and-paid student QR values to the device over the existing HTTP endpoints.
