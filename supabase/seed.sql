insert into public.hostel_settings (
  id,
  hostel_name,
  daily_fee,
  one_time_fee,
  year_stay_limit_days,
  total_rooms,
  beds_per_room
)
values (1, 'TRF Hostel System', 50.00, 500.00, 60, 20, 4)
on conflict (id) do update
set
  hostel_name = excluded.hostel_name,
  daily_fee = excluded.daily_fee,
  one_time_fee = excluded.one_time_fee,
  year_stay_limit_days = excluded.year_stay_limit_days,
  total_rooms = excluded.total_rooms,
  beds_per_room = excluded.beds_per_room;

insert into public.departments (code, name)
values
  ('ape', 'Agricultural and Plantation Engineering'),
  ('civil', 'Civil Engineering'),
  ('ece', 'Electrical and Computer Engineering'),
  ('mech', 'Mechanical Engineering'),
  ('mpe', 'Mathematics and Philosophy of Engineering'),
  ('tat', 'Textile and Apparel Technology')
on conflict (code) do update
set name = excluded.name;

insert into public.rooms (room_number, room_gender, total_beds)
select room_number, room_gender, 4
from (
  select generate_series(1, 10) as room_number, 'female'::public.hostel_gender as room_gender
  union all
  select generate_series(11, 20) as room_number, 'male'::public.hostel_gender as room_gender
) seeded_rooms
on conflict (room_number) do update
set
  room_gender = excluded.room_gender,
  total_beds = excluded.total_beds,
  is_active = true;

insert into public.profiles (
  username,
  role_group,
  role_label,
  managed_gender,
  gender,
  department_code,
  name,
  student_number,
  registration_number,
  faculty,
  degree_program,
  email,
  address,
  home_phone,
  mobile_phone
)
values
  ('s23000427', 'student', 'Student', null, 'male', null, 'H.B.K. Jayananda', 's23000427', '322522330', 'Faculty of Engineering Technology', 'Electronics and Communication Engineering', 's23000427@ousl.lk', 'Demo student address 01', '011 230 0427', '077 230 0427'),
  ('s23000179', 'student', 'Student', null, 'female', null, 'K.A.N. Madumali', 's23000179', '222529086', 'Faculty of Engineering Technology', 'Electronics and Communication Engineering', 's23000179@ousl.lk', 'Demo student address 02', '011 230 0179', '077 230 0179'),
  ('s20003227', 'student', 'Student', null, 'male', null, 'G.R.A. Perera', 's20003227', '622522094', 'Faculty of Engineering Technology', 'Electronics and Communication Engineering', 's20003227@ousl.lk', 'Demo student address 03', '011 200 3227', '077 200 3227'),
  ('s23003727', 'student', 'Student', null, 'female', null, 'W. A. S. Ranishani', 's23003727', '222554550', 'Faculty of Engineering Technology', 'Computer Engineering', 's23003727@ousl.lk', 'Demo student address 04', '011 230 3727', '077 230 3727'),
  ('warden', 'warden', 'Warden', null, null, null, 'Mrs. Dilani Jayawardena', null, null, null, null, 'warden@trf.edu', null, null, '071 880 1200'),
  ('submale', 'warden', 'Sub warden (Male)', 'male', null, null, 'Mr. Shehan Karunarathne', null, null, null, null, 'subwarden.male@trf.edu', null, null, '071 880 1201'),
  ('subfemale', 'warden', 'Sub warden (Female)', 'female', null, null, 'Ms. Tharushi Senanayake', null, null, null, null, 'subwarden.female@trf.edu', null, null, '071 880 1202'),
  ('hodape', 'academic', 'Head of Department (HOD)', null, null, 'ape', 'Dr. Sahan Wijesekara', null, null, null, null, 'hod.ape@campus.edu', null, null, '071 778 9921'),
  ('coordape', 'academic', 'Academic coordinator', null, null, 'ape', 'Ms. Piumi Yatawara', null, null, null, null, 'coordinator.ape@campus.edu', null, null, '071 665 1181'),
  ('hodcivil', 'academic', 'Head of Department (HOD)', null, null, 'civil', 'Dr. Ayesha Silva', null, null, null, null, 'hod.civil@campus.edu', null, null, '071 778 9922'),
  ('coordcivil', 'academic', 'Academic coordinator', null, null, 'civil', 'Mr. Ruwan Bandara', null, null, null, null, 'coordinator.civil@campus.edu', null, null, '071 665 1182'),
  ('hodece', 'academic', 'Head of Department (HOD)', null, null, 'ece', 'Prof. Nadeesha Gunasekara', null, null, null, null, 'hod.ece@campus.edu', null, null, '071 778 9923'),
  ('coordece', 'academic', 'Academic coordinator', null, null, 'ece', 'Ms. Tharindi Fernando', null, null, null, null, 'coordinator.ece@campus.edu', null, null, '071 665 1183'),
  ('hodmech', 'academic', 'Head of Department (HOD)', null, null, 'mech', 'Dr. Lakshan Peris', null, null, null, null, 'hod.mech@campus.edu', null, null, '071 778 9924'),
  ('coordmech', 'academic', 'Academic coordinator', null, null, 'mech', 'Mr. Chamika Rathnayake', null, null, null, null, 'coordinator.mech@campus.edu', null, null, '071 665 1184'),
  ('hodmpe', 'academic', 'Head of Department (HOD)', null, null, 'mpe', 'Prof. Dinithi Karunaratne', null, null, null, null, 'hod.mpe@campus.edu', null, null, '071 778 9925'),
  ('coordmpe', 'academic', 'Academic coordinator', null, null, 'mpe', 'Ms. Kaushalya Nirmani', null, null, null, null, 'coordinator.mpe@campus.edu', null, null, '071 665 1185'),
  ('hodtat', 'academic', 'Head of Department (HOD)', null, null, 'tat', 'Dr. Malsha Abeykoon', null, null, null, null, 'hod.tat@campus.edu', null, null, '071 778 9926'),
  ('coordtat', 'academic', 'Academic coordinator', null, null, 'tat', 'Mr. Dilan Jayasekara', null, null, null, null, 'coordinator.tat@campus.edu', null, null, '071 665 1186'),
  ('counselor', 'academic', 'Student counselor', null, null, null, 'Ms. Nethmi Abesinghe', null, null, null, null, 'counselor@campus.edu', null, null, '071 555 0001')
on conflict (username) do update
set
  role_group = excluded.role_group,
  role_label = excluded.role_label,
  managed_gender = excluded.managed_gender,
  gender = excluded.gender,
  department_code = excluded.department_code,
  name = excluded.name,
  student_number = excluded.student_number,
  registration_number = excluded.registration_number,
  faculty = excluded.faculty,
  degree_program = excluded.degree_program,
  email = excluded.email,
  address = excluded.address,
  home_phone = excluded.home_phone,
  mobile_phone = excluded.mobile_phone;

insert into public.booking_requests (
  id,
  created_at,
  workflow,
  student_username,
  check_in,
  check_out,
  room_number,
  bed_number,
  academic_approver_username,
  academic_status,
  academic_reviewed_by,
  academic_reviewed_at,
  warden_approver_username,
  warden_status,
  warden_reviewed_by,
  warden_reviewed_at,
  department_code,
  course_code,
  academic_activity,
  special_reason,
  home_phone,
  mobile_phone,
  payment_total,
  payment_status,
  payment_paid_at,
  academic_decision_reason,
  warden_decision_reason,
  qr_value,
  cancelled_at,
  student_cleared_at
)
values
  ('BK-1001', timezone('utc', now()) - interval '3 days', 'regular', 's23000179', current_date + 5, current_date + 7, 2, 1, 'hodece', 'pending', null, null, 'warden', 'waiting', null, null, 'ece', 'ECE 1212', 'Weekend lab revision', null, '011 230 0179', '077 230 0179', 650.00, 'unpaid', null, null, null, 'TRF|BK-1001|s23000179', null, null),
  ('BK-1002', timezone('utc', now()) - interval '8 days', 'regular', 's23000179', current_date + 1, current_date + 3, 4, 2, 'coordcivil', 'approved', 'coordcivil', timezone('utc', now()) - interval '6 days', 'subfemale', 'pending', null, null, 'civil', 'CIV 2104', 'Inter-faculty presentation practice', null, '011 230 0179', '077 230 0179', 650.00, 'unpaid', null, null, null, 'TRF|BK-1002|s23000179', null, null),
  ('BK-1003', timezone('utc', now()) - interval '12 days', 'regular', 's23000427', current_date - 1, current_date + 2, 16, 3, 'counselor', 'approved', 'counselor', timezone('utc', now()) - interval '10 days', 'warden', 'approved', 'warden', timezone('utc', now()) - interval '9 days', 'ape', 'APE 1201', 'Morning workshop series', null, '011 230 0427', '077 230 0427', 700.00, 'paid', timezone('utc', now()) - interval '8 days', null, null, 'TRF|BK-1003|s23000427', null, null),
  ('BK-1004', timezone('utc', now()) - interval '2 days', 'special', 's23000427', current_date + 10, current_date + 12, 19, 4, null, 'not_required', null, null, 'submale', 'pending', null, null, null, null, null, 'Participating in an urgent overnight case competition.', '011 230 0427', '077 230 0427', 650.00, 'unpaid', null, null, null, 'TRF|BK-1004|s23000427', null, null),
  ('BK-1005', timezone('utc', now()) - interval '15 days', 'special', 's23000179', current_date - 5, current_date - 3, 1, 2, null, 'not_required', null, null, 'subfemale', 'approved', 'subfemale', timezone('utc', now()) - interval '14 days', null, null, null, 'Medical observation after a late-night field exercise.', '011 230 0179', '077 230 0179', 650.00, 'unpaid', null, null, null, 'TRF|BK-1005|s23000179', null, null),
  ('BK-1006', timezone('utc', now()) - interval '6 days', 'regular', 's23000427', current_date + 14, current_date + 16, 18, 1, 'hodmech', 'rejected', 'hodmech', timezone('utc', now()) - interval '4 days', 'warden', 'waiting', null, null, 'mech', 'MEC 3308', 'Capstone review session', null, '011 230 0427', '077 230 0427', 650.00, 'unpaid', null, 'The request cannot be approved because the stated session is not scheduled for these dates.', null, 'TRF|BK-1006|s23000427', null, null)
on conflict (id) do update
set
  created_at = excluded.created_at,
  workflow = excluded.workflow,
  student_username = excluded.student_username,
  check_in = excluded.check_in,
  check_out = excluded.check_out,
  room_number = excluded.room_number,
  bed_number = excluded.bed_number,
  academic_approver_username = excluded.academic_approver_username,
  academic_status = excluded.academic_status,
  academic_reviewed_by = excluded.academic_reviewed_by,
  academic_reviewed_at = excluded.academic_reviewed_at,
  warden_approver_username = excluded.warden_approver_username,
  warden_status = excluded.warden_status,
  warden_reviewed_by = excluded.warden_reviewed_by,
  warden_reviewed_at = excluded.warden_reviewed_at,
  department_code = excluded.department_code,
  course_code = excluded.course_code,
  academic_activity = excluded.academic_activity,
  special_reason = excluded.special_reason,
  home_phone = excluded.home_phone,
  mobile_phone = excluded.mobile_phone,
  payment_total = excluded.payment_total,
  payment_status = excluded.payment_status,
  payment_paid_at = excluded.payment_paid_at,
  academic_decision_reason = excluded.academic_decision_reason,
  warden_decision_reason = excluded.warden_decision_reason,
  qr_value = excluded.qr_value,
  cancelled_at = excluded.cancelled_at,
  student_cleared_at = excluded.student_cleared_at;

insert into public.booking_review_logs (booking_id, stage, action, actor_username, decision_reason, action_at)
values
  ('BK-1002', 'academic', 'approved', 'coordcivil', null, timezone('utc', now()) - interval '6 days'),
  ('BK-1003', 'academic', 'approved', 'counselor', null, timezone('utc', now()) - interval '10 days'),
  ('BK-1003', 'warden', 'approved', 'warden', null, timezone('utc', now()) - interval '9 days'),
  ('BK-1005', 'warden', 'approved', 'subfemale', null, timezone('utc', now()) - interval '14 days'),
  ('BK-1006', 'academic', 'rejected', 'hodmech', 'The request cannot be approved because the stated session is not scheduled for these dates.', timezone('utc', now()) - interval '4 days')
on conflict (booking_id, stage, actor_username, action_at) do nothing;

insert into public.qr_scan_logs (
  booking_id,
  student_username,
  scanned_at,
  qr_code_name,
  qr_value,
  role,
  result,
  message,
  device_name
)
values
  ('BK-1003', 's23000427', timezone('utc', now()) - interval '1 day' + interval '18 hours 14 minutes 12 seconds', 'BK-1003', 'TRF|BK-1003|s23000427', 'Student', 'confirmed', 'Student booking is approved and payment is complete.', 'ESP32-CAM QR Scanner'),
  ('BK-1005', 's23000179', timezone('utc', now()) + interval '8 hours 42 minutes 30 seconds', 'BK-1005', 'TRF|BK-1005|s23000179', 'Student', 'not confirmed', 'Booking exists, but payment is not complete.', 'ESP32-CAM QR Scanner'),
  (null, null, timezone('utc', now()) + interval '9 hours 5 minutes 8 seconds', 'Unknown QR', 'TRF|BK-9999|unknown-user', 'unknown', 'not confirmed', 'QR code was not matched to a known booking.', 'ESP32-CAM QR Scanner')
on conflict (scanned_at, qr_value, device_name) do nothing;
