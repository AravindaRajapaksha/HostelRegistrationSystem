import { calculatePaymentTotal, calculateRequestedDays, createQrValue } from '../data'
import { hasSupabaseConfig, requireSupabase } from './supabase'

const DEFAULT_DEVICE_NAME = 'ESP32-CAM QR Scanner'

const DEPARTMENT_FALLBACK_BY_CODE = {
  ape: 'Agricultural and Plantation Engineering',
  civil: 'Civil Engineering',
  ece: 'Electrical and Computer Engineering',
  mech: 'Mechanical Engineering',
  mpe: 'Mathematics and Philosophy of Engineering',
  tat: 'Textile and Apparel Technology',
}

const PASSWORD_BY_USERNAME = {
  warden: 'warden@123',
  submale: 'male@123',
  subfemale: 'female@123',
  counselor: 'care@123',
}

export function usesSupabaseBackend() {
  return hasSupabaseConfig
}

export async function loadSupabaseAppState({ iotLogUrl = '' } = {}) {
  const supabase = requireSupabase()

  const [departmentsResult, profilesResult, bookingsResult, clearancesResult, scanLogsResult] =
    await Promise.all([
      supabase.from('departments').select('code, name').order('name'),
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('is_active', true).order('username'),
      supabase.from('booking_requests').select(BOOKING_COLUMNS).order('created_at', { ascending: false }),
      supabase.from('booking_clearances').select('booking_id, cleared_by_username, role_group, cleared_at'),
      supabase.from('qr_scan_logs').select(SCAN_LOG_COLUMNS).order('scanned_at', { ascending: false }),
    ])

  throwOnResultError(departmentsResult, 'load departments')
  throwOnResultError(profilesResult, 'load profiles')
  throwOnResultError(bookingsResult, 'load bookings')
  throwOnResultError(clearancesResult, 'load booking clearances')
  throwOnResultError(scanLogsResult, 'load QR scan logs')

  const departmentCodeToName = new Map(
    (departmentsResult.data ?? []).map((department) => [department.code, department.name]),
  )

  const users = (profilesResult.data ?? []).map((profile) =>
    mapProfileToAppUser(profile, departmentCodeToName),
  )
  const clearancesByBooking = buildClearanceMap(clearancesResult.data ?? [])
  const bookings = (bookingsResult.data ?? []).map((booking) =>
    mapBookingToAppBooking(booking, departmentCodeToName, clearancesByBooking),
  )
  const scanLogs = (scanLogsResult.data ?? []).map(mapScanLogToAppScanLog)

  return {
    users,
    bookings,
    scanLogs,
    iotLogUrl,
  }
}

export async function saveBooking(booking) {
  const supabase = requireSupabase()
  const result = await supabase.from('booking_requests').upsert(mapBookingToDbBooking(booking))
  throwOnResultError(result, `save booking ${booking.id}`)
}

export async function saveBookings(bookings) {
  if (!bookings.length) {
    return
  }

  const supabase = requireSupabase()
  const result = await supabase
    .from('booking_requests')
    .upsert(bookings.map(mapBookingToDbBooking))
  throwOnResultError(result, 'save booking batch')
}

export async function addBookingReviewLogs(logs) {
  if (!logs.length) {
    return
  }

  const supabase = requireSupabase()
  const result = await supabase.from('booking_review_logs').insert(
    logs.map((log) => ({
      booking_id: log.bookingId,
      stage: log.stage,
      action: log.action,
      actor_username: log.actorUsername,
      decision_reason: log.decisionReason || null,
      action_at: log.actionAt,
    })),
  )

  throwOnResultError(result, 'save booking review logs')
}

export async function addBookingClearance(clearance) {
  const supabase = requireSupabase()
  const result = await supabase.from('booking_clearances').upsert({
    booking_id: clearance.bookingId,
    cleared_by_username: clearance.clearedByUsername,
    role_group: clearance.roleGroup,
    cleared_at: clearance.clearedAt,
  })

  throwOnResultError(result, `save booking clearance ${clearance.bookingId}`)
}

export async function addScanLogs(scanLogs) {
  if (!scanLogs.length) {
    return
  }

  const supabase = requireSupabase()
  const result = await supabase.from('qr_scan_logs').upsert(
    scanLogs.map((log) => ({
      id: normalizeNullableString(log.id),
      booking_id: normalizeNullableString(log.bookingId),
      student_username: normalizeNullableString(log.studentUsername),
      scanned_at: log.scannedAt,
      qr_code_name: normalizeNullableString(log.qrCodeName ?? extractBookingId(log.qrValue)),
      qr_value: log.qrValue,
      role: log.role || 'unknown',
      result: log.result || 'not confirmed',
      message: log.message || 'No scan message available.',
      device_name: log.deviceName || DEFAULT_DEVICE_NAME,
    })),
    {
      onConflict: 'scanned_at,qr_value,device_name',
      ignoreDuplicates: true,
    },
  )

  throwOnResultError(result, 'save scan logs')
}

const PROFILE_COLUMNS = [
  'username',
  'role_group',
  'role_label',
  'department_code',
  'managed_gender',
  'gender',
  'name',
  'student_number',
  'registration_number',
  'faculty',
  'degree_program',
  'email',
  'address',
  'home_phone',
  'mobile_phone',
]
  .join(', ')

const BOOKING_COLUMNS = [
  'id',
  'created_at',
  'workflow',
  'student_username',
  'check_in',
  'check_out',
  'requested_days',
  'room_number',
  'bed_number',
  'academic_approver_username',
  'academic_status',
  'academic_reviewed_by',
  'academic_reviewed_at',
  'warden_approver_username',
  'warden_status',
  'warden_reviewed_by',
  'warden_reviewed_at',
  'special_feedback_recipient_username',
  'special_feedback_requested_by',
  'special_feedback_requested_at',
  'department_code',
  'course_code',
  'academic_activity',
  'special_reason',
  'special_feedback_message',
  'special_feedback_provided_by',
  'special_feedback_provided_at',
  'home_phone',
  'mobile_phone',
  'payment_total',
  'payment_status',
  'payment_paid_at',
  'academic_decision_reason',
  'warden_decision_reason',
  'qr_value',
  'cancelled_at',
  'student_cleared_at',
]
  .join(', ')

const SCAN_LOG_COLUMNS = [
  'id',
  'booking_id',
  'student_username',
  'scanned_at',
  'qr_code_name',
  'qr_value',
  'role',
  'result',
  'message',
  'device_name',
]
  .join(', ')

function mapProfileToAppUser(profile, departmentCodeToName) {
  const department = profile.role_label === 'Student counselor'
    ? 'All departments'
    : getDepartmentName(profile.department_code, departmentCodeToName)

  return {
    username: profile.username,
    password: resolveDemoPassword(profile),
    roleGroup: profile.role_group,
    roleLabel: profile.role_label,
    department,
    managedGender: toTitleCase(profile.managed_gender),
    gender: toTitleCase(profile.gender),
    name: profile.name,
    studentNumber: profile.student_number ?? '',
    registrationNumber: profile.registration_number ?? '',
    faculty: profile.faculty ?? '',
    degreeProgram: profile.degree_program ?? '',
    email: profile.email ?? '',
    address: profile.address ?? '',
    homePhone: profile.home_phone ?? '',
    mobilePhone: profile.mobile_phone ?? '',
  }
}

function mapBookingToAppBooking(booking, departmentCodeToName, clearancesByBooking) {
  const requestedDays =
    booking.requested_days ?? calculateRequestedDays(booking.check_in, booking.check_out)
  const clearances = clearancesByBooking.get(booking.id) ?? { academic: [], warden: [] }

  return {
    id: booking.id,
    createdAt: booking.created_at,
    workflow: booking.workflow,
    studentUsername: booking.student_username,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    requestedDays,
    roomNumber: booking.room_number,
    bedNumber: booking.bed_number,
    academicApproverUsername: booking.academic_approver_username ?? '',
    academicStatus: booking.academic_status,
    academicReviewedBy: booking.academic_reviewed_by ?? '',
    academicReviewedAt: booking.academic_reviewed_at ?? '',
    wardenApproverUsername: booking.warden_approver_username ?? '',
    wardenStatus: booking.warden_status,
    wardenReviewedBy: booking.warden_reviewed_by ?? '',
    wardenReviewedAt: booking.warden_reviewed_at ?? '',
    specialFeedbackRecipientUsername: booking.special_feedback_recipient_username ?? '',
    specialFeedbackRequestedBy: booking.special_feedback_requested_by ?? '',
    specialFeedbackRequestedAt: booking.special_feedback_requested_at ?? '',
    department: getDepartmentName(booking.department_code, departmentCodeToName),
    courseCode: booking.course_code ?? '',
    academicActivity: booking.academic_activity ?? '',
    specialReason: booking.special_reason ?? '',
    specialFeedbackMessage: booking.special_feedback_message ?? '',
    specialFeedbackProvidedBy: booking.special_feedback_provided_by ?? '',
    specialFeedbackProvidedAt: booking.special_feedback_provided_at ?? '',
    homePhone: booking.home_phone ?? '',
    mobilePhone: booking.mobile_phone ?? '',
    paymentTotal:
      typeof booking.payment_total === 'number'
        ? booking.payment_total
        : calculatePaymentTotal(requestedDays),
    paymentStatus: booking.payment_status ?? 'unpaid',
    paymentPaidAt: booking.payment_paid_at ?? '',
    academicDecisionReason: booking.academic_decision_reason ?? '',
    wardenDecisionReason: booking.warden_decision_reason ?? '',
    qrValue: booking.qr_value ?? createQrValue(booking.id, booking.student_username),
    cancelledAt: booking.cancelled_at ?? '',
    studentClearedAt: booking.student_cleared_at ?? '',
    academicClearedBy: clearances.academic,
    wardenClearedBy: clearances.warden,
  }
}

function mapScanLogToAppScanLog(log) {
  return {
    id: log.id,
    bookingId: log.booking_id ?? '',
    studentUsername: log.student_username ?? '',
    scannedAt: log.scanned_at,
    qrCodeName: log.qr_code_name ?? log.booking_id ?? 'Unknown QR',
    qrValue: log.qr_value,
    role: log.role ?? 'unknown',
    result: log.result ?? 'not confirmed',
    message: log.message ?? 'No scan message available.',
    deviceName: log.device_name ?? DEFAULT_DEVICE_NAME,
  }
}

function mapBookingToDbBooking(booking) {
  return {
    id: booking.id,
    created_at: booking.createdAt || new Date().toISOString(),
    workflow: booking.workflow,
    student_username: booking.studentUsername,
    check_in: booking.checkIn,
    check_out: booking.checkOut,
    room_number: Number(booking.roomNumber),
    bed_number: Number(booking.bedNumber),
    academic_approver_username: normalizeNullableString(booking.academicApproverUsername),
    academic_status: booking.academicStatus ?? 'pending',
    academic_reviewed_by: normalizeNullableString(booking.academicReviewedBy),
    academic_reviewed_at: normalizeNullableString(booking.academicReviewedAt),
    warden_approver_username: normalizeNullableString(booking.wardenApproverUsername),
    warden_status: booking.wardenStatus ?? 'pending',
    warden_reviewed_by: normalizeNullableString(booking.wardenReviewedBy),
    warden_reviewed_at: normalizeNullableString(booking.wardenReviewedAt),
    special_feedback_recipient_username: normalizeNullableString(booking.specialFeedbackRecipientUsername),
    special_feedback_requested_by: normalizeNullableString(booking.specialFeedbackRequestedBy),
    special_feedback_requested_at: normalizeNullableString(booking.specialFeedbackRequestedAt),
    department_code: normalizeNullableString(getDepartmentCode(booking.department)),
    course_code: normalizeNullableString(booking.courseCode),
    academic_activity: normalizeNullableString(booking.academicActivity),
    special_reason: normalizeNullableString(booking.specialReason),
    special_feedback_message: normalizeNullableString(booking.specialFeedbackMessage),
    special_feedback_provided_by: normalizeNullableString(booking.specialFeedbackProvidedBy),
    special_feedback_provided_at: normalizeNullableString(booking.specialFeedbackProvidedAt),
    home_phone: normalizeNullableString(booking.homePhone),
    mobile_phone: normalizeNullableString(booking.mobilePhone),
    payment_total: booking.paymentTotal ?? calculatePaymentTotal(booking.requestedDays ?? calculateRequestedDays(booking.checkIn, booking.checkOut)),
    payment_status: booking.paymentStatus ?? 'unpaid',
    payment_paid_at: normalizeNullableString(booking.paymentPaidAt),
    academic_decision_reason: normalizeNullableString(booking.academicDecisionReason),
    warden_decision_reason: normalizeNullableString(booking.wardenDecisionReason),
    qr_value: booking.qrValue ?? createQrValue(booking.id, booking.studentUsername),
    cancelled_at: normalizeNullableString(booking.cancelledAt),
    student_cleared_at: normalizeNullableString(booking.studentClearedAt),
  }
}

function buildClearanceMap(clearances) {
  const clearancesByBooking = new Map()

  clearances.forEach((clearance) => {
    const current = clearancesByBooking.get(clearance.booking_id) ?? { academic: [], warden: [] }
    const nextAcademic = current.academic
    const nextWarden = current.warden

    if (clearance.role_group === 'academic') {
      nextAcademic.push(clearance.cleared_by_username)
    }

    if (clearance.role_group === 'warden') {
      nextWarden.push(clearance.cleared_by_username)
    }

    clearancesByBooking.set(clearance.booking_id, {
      academic: nextAcademic,
      warden: nextWarden,
    })
  })

  return clearancesByBooking
}

function getDepartmentName(code, departmentCodeToName) {
  if (!code) {
    return ''
  }

  return departmentCodeToName.get(code) ?? DEPARTMENT_FALLBACK_BY_CODE[code] ?? code
}

function getDepartmentCode(name) {
  if (!name || name === 'All departments') {
    return null
  }

  const match = Object.entries(DEPARTMENT_FALLBACK_BY_CODE).find(([, value]) => value === name)
  return match?.[0] ?? null
}

function resolveDemoPassword(profile) {
  if (PASSWORD_BY_USERNAME[profile.username]) {
    return PASSWORD_BY_USERNAME[profile.username]
  }

  if (profile.role_group === 'student') {
    return profile.username
  }

  if (profile.role_group === 'academic') {
    return profile.role_label === 'Academic coordinator' ? 'coord@123' : 'hod@123'
  }

  return profile.username
}

function extractBookingId(qrValue = '') {
  if (!qrValue.includes('|')) {
    return qrValue
  }

  return qrValue.split('|')[1] ?? ''
}

function normalizeNullableString(value) {
  return value ? String(value) : null
}

function toTitleCase(value) {
  if (!value) {
    return ''
  }

  return String(value).charAt(0).toUpperCase() + String(value).slice(1)
}

function throwOnResultError(result, action) {
  if (result.error) {
    throw new Error(`Supabase could not ${action}: ${result.error.message}`)
  }
}
