# Hostel System Presentation Guide

## 1. Project Summary

This project is a **React + Vite hostel booking system** connected to **Supabase**.
It supports the full booking process from **student request** to **academic approval**, **warden approval**, **payment confirmation**, **QR generation**, and **QR scan history** from an **ESP32-CAM scanner**.

The main goal of the system is to digitalize hostel booking and approval work that would normally be handled manually.

## 2. Technologies Used

- **Frontend:** React 19 + Vite
- **Database / backend service:** Supabase
- **QR generation:** `qrcode` package
- **Local fallback storage:** browser `localStorage`
- **IoT integration:** ESP32-CAM scanner log import and QR sync

## 3. Main User Roles

- **Student**
  Creates bookings, views status, pays, and uses the QR code after approval.
- **Academic staff**
  Reviews regular academic-related booking requests and can send feedback for special cases.
- **Warden / Sub-warden**
  Handles hostel-side approval, emergency bookings, payment recording for emergency cases, and QR confirmation history.

## 4. Main Workflows

### Regular booking

1. Student logs in.
2. Student fills booking form.
3. System validates dates, contacts, department, subject, and room/bed availability.
4. Booking is sent to academic staff.
5. Academic staff approve or reject.
6. If approved, it moves to the warden.
7. Warden approves or rejects.
8. Student pays.
9. QR becomes valid for scanner access.

### Special booking

1. Student submits a booking with a special reason.
2. Academic approval is not required at first.
3. Warden reviews the request.
4. If approved, the warden can request feedback from selected academic staff.
5. Payment and QR flow continue after approval.

### Emergency booking

1. Warden creates the booking directly.
2. System can create or update the student profile if needed.
3. Warden approves the booking.
4. Warden records payment.
5. QR is activated and synced to the scanner.

## 5. Important Files

- `src/main.jsx`
  Starts the React application.
- `src/App.jsx`
  Main application logic, state handling, workflow actions, and UI views.
- `src/data.js`
  Demo data, constants, helper functions, status logic, room logic, and QR helper functions.
- `src/lib/supabase.js`
  Creates the Supabase client and checks whether environment variables exist.
- `src/lib/appStateStore.js`
  Loads data from Supabase, saves bookings, saves profiles, saves review logs, and maps DB rows to frontend objects.
- `supabase/website_schema.sql`
  Database schema.
- `supabase/seed.sql`
  Demo seed data.

## 6. How the System Starts

### `src/main.jsx`

`main.jsx` is the entry point. It renders the `App` component into the root HTML element.

### `App()`

The `App` function is the heart of the system.
It:

- decides whether Supabase is available
- loads initial state
- keeps session details
- keeps the current page/view
- stores feedback messages for the user
- refreshes shared data from Supabase
- routes actions to different workflow functions

## 7. Key Functions and How They Work

### `createInitialState()` in `src/data.js`

This function creates the default demo state when Supabase is not being used.
It prepares:

- demo students
- wardens
- academic staff
- sample bookings
- sample scan logs

This is the fallback data model for offline/demo mode.

### `handleLogin()` in `src/App.jsx`

What it does:

- optionally refreshes users from Supabase
- matches username and password
- creates a session
- sends the user to the correct default page

Why it matters:

It controls access for the three role types and starts role-based navigation.

### `submitBooking()` in `src/App.jsx`

What it does:

- checks that the current user is a student
- validates dates and phone numbers
- checks regular vs special workflow requirements
- calculates requested stay days
- checks the student's yearly day limit
- checks available room/bed allocation
- creates a booking ID
- assigns the academic approver for regular bookings
- generates a QR value
- saves the booking locally or in Supabase

Why it matters:

This is the main function used when a student creates a hostel booking.

### `createEmergencyBooking()` in `src/App.jsx`

What it does:

- can only be used by wardens
- validates student details and stay details
- checks room/bed availability
- finds an existing student or creates a new one
- creates an emergency booking
- saves the profile and booking to Supabase if connected

Why it matters:

It supports urgent hostel cases where the student may not create the booking personally.

### `decideAcademic()` in `src/App.jsx`

What it does:

- checks that the academic user is allowed to review the booking
- requires a reason for rejection
- creates an academic review log
- updates the academic approval state
- saves the updated booking and review log

Why it matters:

It records the academic decision and pushes the request to the next step when approved.

### `decideWarden()` in `src/App.jsx`

What it does:

- checks warden permissions
- requires a reason for rejection
- updates the warden decision
- can assign special feedback recipients for special/emergency workflows
- automatically rejects overlapping pending requests for the same room and bed after one is approved
- saves booking changes and review logs

Why it matters:

This is the final operational approval stage before payment and QR access.

### `payBooking()` in `src/App.jsx`

What it does:

- lets a student mark a booking as paid
- stores payment date and status
- attempts to sync approved QR values to the ESP32 scanner

Why it matters:

A booking is only scanner-ready after approval and payment.

### `recordEmergencyPayment()` in `src/App.jsx`

What it does:

- lets a warden record payment for emergency bookings
- updates payment status
- syncs valid QR values to the ESP32 scanner

Why it matters:

Emergency bookings are warden-managed, so payment is also handled there.

### `syncApprovedBookingsToIot()` in `src/App.jsx`

What it does:

- reads the configured ESP32 URL
- clears the current allowed-user list on the scanner
- sends each approved and paid QR code to the ESP32

Why it matters:

It keeps the physical scanner device synchronized with the website's approved booking data.

### `importScanLogs()` and `syncIotLogFromUrl()` in `src/App.jsx`

What they do:

- fetch raw scan log text from the ESP32
- parse each row
- match QR values with bookings
- classify result as confirmed or not confirmed
- save the scan history

Why they matter:

They connect the website with real scanner activity.

### `getAvailableBeds()` in `src/data.js`

What it does:

- loops through allowed rooms for the student's gender
- checks each bed
- ignores beds already used by approved overlapping bookings
- returns the free bed list

Why it matters:

This prevents two approved bookings from getting the same bed at the same time.

### `getCurrentStatus()` in `src/data.js`

What it does:

- checks cancellation
- checks academic status
- checks warden status
- returns a user-friendly booking status like:
  - `pending academic`
  - `pending warden`
  - `approved`
  - `not approved`
  - `cancelled`

Why it matters:

Most dashboards and badges depend on this function.

### `resolveAppState()` and `loadState()` in `src/App.jsx`

What they do:

- normalize state loaded from local storage or Supabase
- fill missing fields
- migrate older saved structures
- rebuild academic review information from logs

Why they matter:

They protect the app from broken or outdated stored data.

### `loadSupabaseAppState()` in `src/lib/appStateStore.js`

What it does:

- checks schema readiness
- loads departments, profiles, bookings, review logs, clearances, and scan logs
- maps database rows into frontend objects

Why it matters:

This is the main bridge between the React app and the Supabase database.

### `saveBooking()`, `saveBookings()`, `saveUserProfile()` in `src/lib/appStateStore.js`

What they do:

- convert frontend objects into database format
- use Supabase `upsert` to insert or update rows

Why they matter:

These functions are responsible for storing application changes permanently.

## 8. Database Tables to Explain

### `profiles`

Stores users such as students, academic staff, and wardens.

### `booking_requests`

Stores the main booking details:

- workflow type
- student
- room and bed
- approval statuses
- payment status
- QR value
- contact details

### `booking_review_logs`

Stores approval history such as who approved or rejected and when.

### `booking_clearances`

Stores history-clearing actions done by academic or warden roles.

### `qr_scan_logs`

Stores QR scans imported from the ESP32 scanner.

### `departments`

Stores the department master list.

### `rooms`

Stores room numbers, room gender, and bed counts.

## 9. Suggested Demo Flow for Your Presentation

1. Start with the home page and explain the three roles.
2. Log in as a student and create a regular booking.
3. Show how the system checks dates, room availability, and yearly day limits.
4. Log in as an academic user and approve the request.
5. Log in as a warden and approve the booking.
6. Go back as the student and complete payment.
7. Show the QR code becoming usable.
8. Explain how the ESP32 scanner log can be imported and verified.

## 10. Simple Speaking Script

You can say this:

"This system is a hostel booking management platform built using React, Vite, and Supabase. Students can submit booking requests, academic staff can review academic-related requests, and wardens can manage hostel approval, emergency bookings, and QR confirmation history. After a booking is approved and paid, the system generates a QR code and can sync that QR to an ESP32-CAM scanner. The system also imports scanner logs so the warden can confirm whether a scan matches an approved paid booking."

## 11. Important Credentials for Demo

From the current demo data:

- Student: `s23000427` / `s23000427`
- Student: `s23000179` / `s23000179`
- Warden: `warden` / `warden@123`
- Sub-warden male: `submale` / `male@123`
- Sub-warden female: `subfemale` / `female@123`
- Academic HOD: `hod...` / `hod@123`
- Academic coordinator: `coord...` / `coord@123`
- Counselor: `counselor` / `care@123`

## 12. Notes You Should Mention Honestly

There are two implementation details worth knowing before presenting:

1. The frontend helper `calculateRequestedDays()` counts days differently from the database generated `requested_days` value.
2. The frontend helper `calculatePaymentTotal()` currently uses only the daily fee, while the database trigger can also include the one-time fee.

So if someone asks about exact fee or day calculation, the safe answer is:

"The business logic is mostly implemented in the frontend for the demo flow, but the database schema also contains default and generated logic. Those two sides should ideally be aligned in the next refinement."

## 13. Best Short Conclusion

"This project shows a complete digital hostel workflow with role-based access, booking approvals, payment tracking, QR generation, and IoT scanner integration. The main strength of the system is that it connects administrative approval steps with real hostel entry validation."
