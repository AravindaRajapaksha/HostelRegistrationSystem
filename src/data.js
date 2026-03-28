const MS_PER_DAY = 1000 * 60 * 60 * 24

export const DAILY_FEE = 50
export const ONE_TIME_FEE = 500
export const YEAR_STAY_LIMIT = 60
export const TOTAL_ROOMS = 20
export const BEDS_PER_ROOM = 4
export const FEMALE_ROOM_NUMBERS = Array.from({ length: TOTAL_ROOMS / 2 }, (_, index) => index + 1)
export const MALE_ROOM_NUMBERS = Array.from(
  { length: TOTAL_ROOMS / 2 },
  (_, index) => index + 1 + TOTAL_ROOMS / 2,
)

export const CONTACTS = {
  warden: '071 880 1200',
  subWardenMale: '071 880 1201',
  subWardenFemale: '071 880 1202',
}

export const RULE_GROUPS = [
  {
    title: 'Common rules',
    items: [
      'Keep your booking confirmation ready for hostel entry checks.',
      'Respect the 60-day annual stay limit and report special situations early.',
      'Payments should be completed before check-in.',
    ],
  },
  {
    title: 'Reading room rules',
    items: [
      'Use quiet mode at all times and keep shared desks clean.',
      'Food is not allowed in the reading room.',
      'Switch off lights and fans when you leave.',
    ],
  },
  {
    title: 'Bedroom rules',
    items: [
      'Students must use only the assigned room and bed.',
      'Visitors are not permitted in sleeping areas.',
      'Damage to beds, lockers, or switches must be reported immediately.',
    ],
  },
  {
    title: 'Rule-breaking punishments',
    items: [
      'Written warnings are recorded in the student profile.',
      'Repeated violations can lead to booking suspension.',
      'Serious incidents are escalated to the warden and academic staff.',
    ],
  },
]

export const WARDEN_ONLY_WORKFLOWS = ['special', 'emergency']
export const DEPARTMENT_OPTIONS = [
  'Agricultural and Plantation Engineering',
  'Civil Engineering',
  'Electrical and Computer Engineering',
  'Mechanical Engineering',
  'Mathematics and Philosophy of Engineering',
  'Textile and Apparel Technology',
]

export const SUBJECT_OPTIONS = [
  'EEX5346',
  'EEX5333',
  'EEX4436',
  'EEY4181',
  'MHZ5554',
  'MHZ4553',
]

export const ACADEMIC_ACTIVITY_OPTIONS = [
  'CAT 01 Exam',
  'CAT 02 Exam',
  'Final Exam',
  'Dayschool',
  'Lab Session',
  'Presentation',
  'Workshop',
]

const DEMO_STUDENT_USERS = [
  {
    username: 's23000427',
    password: 's23000427',
    roleGroup: 'student',
    roleLabel: 'Student',
    name: 'H.B.K. Jayananda',
    gender: 'Male',
    studentNumber: 's23000427',
    registrationNumber: '322522330',
    faculty: 'Faculty of Engineering Technology',
    degreeProgram: 'Electronics and Communication Engineering',
    email: 's23000427@ousl.lk',
    address: 'Demo student address 01',
    homePhone: '011 230 0427',
    mobilePhone: '077 230 0427',
  },
  {
    username: 's23000179',
    password: 's23000179',
    roleGroup: 'student',
    roleLabel: 'Student',
    name: 'K.A.N. Madumali',
    gender: 'Female',
    studentNumber: 's23000179',
    registrationNumber: '222529086',
    faculty: 'Faculty of Engineering Technology',
    degreeProgram: 'Electronics and Communication Engineering',
    email: 's23000179@ousl.lk',
    address: 'Demo student address 02',
    homePhone: '011 230 0179',
    mobilePhone: '077 230 0179',
  },
  {
    username: 's20003227',
    password: 's20003227',
    roleGroup: 'student',
    roleLabel: 'Student',
    name: 'G.R.A. perera',
    gender: 'Male',
    studentNumber: 's20003227',
    registrationNumber: '622522094',
    faculty: 'Faculty of Engineering Technology',
    degreeProgram: 'Electronics and Communication Engineering',
    email: 's20003227@ousl.lk',
    address: 'Demo student address 03',
    homePhone: '011 200 3227',
    mobilePhone: '077 200 3227',
  },
  {
    username: 's23003727',
    password: 's23003727',
    roleGroup: 'student',
    roleLabel: 'Student',
    name: 'W. A. S. Ranishani',
    gender: 'Female',
    studentNumber: 's23003727',
    registrationNumber: '222554550',
    faculty: 'Faculty of Engineering Technology',
    degreeProgram: 'Computer Engineering',
    email: 's23003727@ousl.lk',
    address: 'Demo student address 04',
    homePhone: '011 230 3727',
    mobilePhone: '077 230 3727',
  },
]

const ACADEMIC_DEPARTMENT_STAFF = [
  {
    department: 'Agricultural and Plantation Engineering',
    code: 'ape',
    hodName: 'Dr. Sahan Wijesekara',
    coordinatorName: 'Ms. Piumi Yatawara',
    hodPhone: '071 778 9921',
    coordinatorPhone: '071 665 1181',
  },
  {
    department: 'Civil Engineering',
    code: 'civil',
    hodName: 'Dr. Ayesha Silva',
    coordinatorName: 'Mr. Ruwan Bandara',
    hodPhone: '071 778 9922',
    coordinatorPhone: '071 665 1182',
  },
  {
    department: 'Electrical and Computer Engineering',
    code: 'ece',
    hodName: 'Prof. Nadeesha Gunasekara',
    coordinatorName: 'Ms. Tharindi Fernando',
    hodPhone: '071 778 9923',
    coordinatorPhone: '071 665 1183',
  },
  {
    department: 'Mechanical Engineering',
    code: 'mech',
    hodName: 'Dr. Lakshan Peris',
    coordinatorName: 'Mr. Chamika Rathnayake',
    hodPhone: '071 778 9924',
    coordinatorPhone: '071 665 1184',
  },
  {
    department: 'Mathematics and Philosophy of Engineering',
    code: 'mpe',
    hodName: 'Prof. Dinithi Karunaratne',
    coordinatorName: 'Ms. Kaushalya Nirmani',
    hodPhone: '071 778 9925',
    coordinatorPhone: '071 665 1185',
  },
  {
    department: 'Textile and Apparel Technology',
    code: 'tat',
    hodName: 'Dr. Malsha Abeykoon',
    coordinatorName: 'Mr. Dilan Jayasekara',
    hodPhone: '071 778 9926',
    coordinatorPhone: '071 665 1186',
  },
]

export function createInitialState() {
  const today = startOfDay(new Date())
  const users = [
    ...DEMO_STUDENT_USERS,
    {
      username: 'warden',
      password: 'warden@123',
      roleGroup: 'warden',
      roleLabel: 'Warden',
      name: 'Mrs. Dilani Jayawardena',
      email: 'warden@trf.edu',
      mobilePhone: CONTACTS.warden,
    },
    {
      username: 'submale',
      password: 'male@123',
      roleGroup: 'warden',
      roleLabel: 'Sub warden (Male)',
      name: 'Mr. Shehan Karunarathne',
      email: 'subwarden.male@trf.edu',
      mobilePhone: CONTACTS.subWardenMale,
    },
    {
      username: 'subfemale',
      password: 'female@123',
      roleGroup: 'warden',
      roleLabel: 'Sub warden (Female)',
      name: 'Ms. Tharushi Senanayake',
      email: 'subwarden.female@trf.edu',
      mobilePhone: CONTACTS.subWardenFemale,
    },
    ...createAcademicUsers(),
  ]

  const bookings = [
    createBooking({
      id: 'BK-1001',
      createdOffset: -3,
      startOffset: 5,
      endOffset: 7,
      workflow: 'regular',
      studentUsername: 's23000179',
      roomNumber: 2,
      bedNumber: 1,
      academicApproverUsername: 'hodece',
      academicStatus: 'pending',
      wardenApproverUsername: 'warden',
      wardenStatus: 'waiting',
      department: 'Electrical and Computer Engineering',
      courseCode: 'ECE 1212',
      academicActivity: 'Weekend lab revision',
      homePhone: '011 230 0179',
      mobilePhone: '077 230 0179',
    }),
    createBooking({
      id: 'BK-1002',
      createdOffset: -8,
      startOffset: 1,
      endOffset: 3,
      workflow: 'regular',
      studentUsername: 's23000179',
      roomNumber: 4,
      bedNumber: 2,
      academicApproverUsername: 'coordcivil',
      academicStatus: 'approved',
      academicReviewedBy: 'coordcivil',
      academicReviewedAt: toIsoDate(addDays(today, -6)),
      wardenApproverUsername: 'subfemale',
      wardenStatus: 'pending',
      department: 'Civil Engineering',
      courseCode: 'CIV 2104',
      academicActivity: 'Inter-faculty presentation practice',
      homePhone: '011 230 0179',
      mobilePhone: '077 230 0179',
    }),
    createBooking({
      id: 'BK-1003',
      createdOffset: -12,
      startOffset: -1,
      endOffset: 2,
      workflow: 'regular',
      studentUsername: 's23000427',
      roomNumber: 16,
      bedNumber: 3,
      academicApproverUsername: 'counselor',
      academicStatus: 'approved',
      academicReviewedBy: 'counselor',
      academicReviewedAt: toIsoDate(addDays(today, -10)),
      wardenApproverUsername: 'warden',
      wardenStatus: 'approved',
      wardenReviewedBy: 'warden',
      wardenReviewedAt: toIsoDate(addDays(today, -9)),
      department: 'Agricultural and Plantation Engineering',
      courseCode: 'APE 1201',
      academicActivity: 'Morning workshop series',
      homePhone: '011 230 0427',
      mobilePhone: '077 230 0427',
      paymentStatus: 'paid',
      paymentPaidAt: toIsoDate(addDays(today, -8)),
    }),
    createBooking({
      id: 'BK-1004',
      createdOffset: -2,
      startOffset: 10,
      endOffset: 12,
      workflow: 'special',
      studentUsername: 's23000427',
      roomNumber: 19,
      bedNumber: 4,
      specialReason: 'Participating in an urgent overnight case competition.',
      homePhone: '011 230 0427',
      mobilePhone: '077 230 0427',
      wardenApproverUsername: 'submale',
      wardenStatus: 'pending',
    }),
    createBooking({
      id: 'BK-1005',
      createdOffset: -15,
      startOffset: -5,
      endOffset: -3,
      workflow: 'special',
      studentUsername: 's23000179',
      roomNumber: 1,
      bedNumber: 2,
      specialReason: 'Medical observation after a late-night field exercise.',
      homePhone: '011 230 0179',
      mobilePhone: '077 230 0179',
      wardenApproverUsername: 'subfemale',
      wardenStatus: 'approved',
      wardenReviewedBy: 'subfemale',
      wardenReviewedAt: toIsoDate(addDays(today, -14)),
      specialFeedbackRecipients: ['counselor', 'hodape'],
      specialFeedbackRequestedBy: 'subfemale',
      specialFeedbackRequestedAt: toIsoDate(addDays(today, -14)),
      specialFeedbackEntries: [
        {
          actorUsername: 'counselor',
          message: 'Student counselor confirmed the medical note and asked the warden team to keep a return-to-hostel follow-up on file.',
          providedAt: toIsoDate(addDays(today, -13)),
        },
        {
          actorUsername: 'hodape',
          message: 'HOD acknowledged the emergency case and asked the warden to keep the department updated until checkout.',
          providedAt: toIsoDate(addDays(today, -12)),
        },
      ],
      paymentStatus: 'unpaid',
    }),
    createBooking({
      id: 'BK-1006',
      createdOffset: -6,
      startOffset: 14,
      endOffset: 16,
      workflow: 'regular',
      studentUsername: 's23000427',
      roomNumber: 18,
      bedNumber: 1,
      academicApproverUsername: 'hodmech',
      academicStatus: 'rejected',
      academicReviewedBy: 'hodmech',
      academicReviewedAt: toIsoDate(addDays(today, -4)),
      academicDecisionReason: 'The request cannot be approved because the stated session is not scheduled for these dates.',
      wardenApproverUsername: 'warden',
      wardenStatus: 'waiting',
      department: 'Mechanical Engineering',
      courseCode: 'MEC 3308',
      academicActivity: 'Capstone review session',
      homePhone: '011 230 0427',
      mobilePhone: '077 230 0427',
    }),
  ]

  return {
    users,
    bookings,
    scanLogs: createDemoScanLogs(users, bookings),
    iotLogUrl: '',
  }

  function createBooking(overrides) {
    const checkIn = toIsoDate(addDays(today, overrides.startOffset))
    const checkOut = toIsoDate(addDays(today, overrides.endOffset))
    const requestedDays = calculateRequestedDays(checkIn, checkOut)

    return {
      id: overrides.id,
      createdAt: toIsoDate(addDays(today, overrides.createdOffset)),
      workflow: overrides.workflow,
      studentUsername: overrides.studentUsername,
      checkIn,
      checkOut,
      requestedDays,
      roomNumber: overrides.roomNumber,
      bedNumber: overrides.bedNumber,
      academicApproverUsername: overrides.academicApproverUsername ?? '',
      academicStatus: overrides.academicStatus ?? 'not_required',
      academicReviewedBy: overrides.academicReviewedBy ?? '',
      academicReviewedAt: overrides.academicReviewedAt ?? '',
      academicDecisionReason: overrides.academicDecisionReason ?? '',
      wardenApproverUsername: overrides.wardenApproverUsername ?? '',
      wardenStatus: overrides.wardenStatus ?? 'pending',
      wardenReviewedBy: overrides.wardenReviewedBy ?? '',
      wardenReviewedAt: overrides.wardenReviewedAt ?? '',
      wardenDecisionReason: overrides.wardenDecisionReason ?? '',
      department: overrides.department ?? '',
      courseCode: overrides.courseCode ?? '',
      academicActivity: overrides.academicActivity ?? '',
      specialReason: overrides.specialReason ?? '',
      specialFeedbackRecipients: overrides.specialFeedbackRecipients ?? [],
      specialFeedbackRequestedBy: overrides.specialFeedbackRequestedBy ?? '',
      specialFeedbackRequestedAt: overrides.specialFeedbackRequestedAt ?? '',
      specialFeedbackEntries: overrides.specialFeedbackEntries ?? [],
      homePhone: overrides.homePhone ?? '',
      mobilePhone: overrides.mobilePhone ?? '',
      paymentTotal: calculatePaymentTotal(requestedDays),
      paymentStatus: overrides.paymentStatus ?? 'unpaid',
      paymentPaidAt: overrides.paymentPaidAt ?? '',
      qrValue: createQrValue(overrides.id, overrides.studentUsername),
      cancelledAt: '',
      studentClearedAt: '',
      academicClearedBy: [],
      wardenClearedBy: [],
    }
  }
}

function createAcademicUsers() {
  return [
    ...ACADEMIC_DEPARTMENT_STAFF.flatMap((staff) => [
      {
        username: `hod${staff.code}`,
        password: 'hod@123',
        roleGroup: 'academic',
        roleLabel: 'Head of Department (HOD)',
        department: staff.department,
        name: staff.hodName,
        email: `hod.${staff.code}@campus.edu`,
        mobilePhone: staff.hodPhone,
      },
      {
        username: `coord${staff.code}`,
        password: 'coord@123',
        roleGroup: 'academic',
        roleLabel: 'Academic coordinator',
        department: staff.department,
        name: staff.coordinatorName,
        email: `coordinator.${staff.code}@campus.edu`,
        mobilePhone: staff.coordinatorPhone,
      },
    ]),
    {
      username: 'counselor',
      password: 'care@123',
      roleGroup: 'academic',
      roleLabel: 'Student counselor',
      department: 'All departments',
      name: 'Ms. Imani Wickramasinghe',
      email: 'counselor@campus.edu',
      mobilePhone: '077 600 7711',
    },
  ]
}

export function createDemoScanLogs(users, bookings) {
  const paidBooking = bookings.find((booking) => getCurrentStatus(booking) === 'approved' && isPaymentComplete(booking))
  const unpaidBooking = bookings.find((booking) => getCurrentStatus(booking) === 'approved' && !isPaymentComplete(booking))
  const student = users.find((user) => user.username === paidBooking?.studentUsername)
  const unpaidStudent = users.find((user) => user.username === unpaidBooking?.studentUsername)

  return [
    {
      id: 'SCAN-1001',
      scannedAt: buildScanTimestamp(-1, 18, 14, 12),
      qrValue: paidBooking?.qrValue ?? 'TRF|BK-1003|s23000427',
      qrCodeName: paidBooking?.id ?? 'BK-1003',
      role: student?.roleLabel ?? 'Student',
      result: 'confirmed',
      message: 'Approved and paid booking matched successfully.',
      bookingId: paidBooking?.id ?? 'BK-1003',
      studentUsername: paidBooking?.studentUsername ?? 's23000427',
      deviceName: 'ESP32-CAM QR Scanner',
    },
    {
      id: 'SCAN-1002',
      scannedAt: buildScanTimestamp(0, 8, 42, 30),
      qrValue: unpaidBooking?.qrValue ?? 'TRF|BK-1005|s23000179',
      qrCodeName: unpaidBooking?.id ?? 'BK-1005',
      role: unpaidStudent?.roleLabel ?? 'Student',
      result: 'not confirmed',
      message: 'Booking was approved, but payment is still pending.',
      bookingId: unpaidBooking?.id ?? 'BK-1005',
      studentUsername: unpaidBooking?.studentUsername ?? 's23000179',
      deviceName: 'ESP32-CAM QR Scanner',
    },
    {
      id: 'SCAN-1003',
      scannedAt: buildScanTimestamp(0, 9, 5, 8),
      qrValue: 'TRF|BK-9999|unknown-user',
      qrCodeName: 'Unknown QR',
      role: 'unknown',
      result: 'not confirmed',
      message: 'QR code was not found in the hostel booking records.',
      bookingId: '',
      studentUsername: '',
      deviceName: 'ESP32-CAM QR Scanner',
    },
  ]
}

export function calculateRequestedDays(checkIn, checkOut) {
  if (!checkIn || !checkOut) {
    return 0
  }

  const start = startOfDay(new Date(checkIn))
  const end = startOfDay(new Date(checkOut))

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0
  }

  const diffDays = Math.round((end - start) / MS_PER_DAY)
  return Math.max(1, diffDays)
}

export function calculatePaymentTotal(requestedDays) {
  return requestedDays > 0 ? requestedDays * DAILY_FEE : 0
}

export function createQrValue(id, studentUsername) {
  return `TRF|${id}|${studentUsername}`
}

export function isPaymentComplete(booking) {
  return booking.paymentStatus === 'paid'
}

export function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function toIsoDate(value) {
  return startOfDay(value).toISOString().slice(0, 10)
}

export function getBookingYear(booking) {
  return Number(String(booking.checkIn ?? '').slice(0, 4))
}

export function getCurrentStatus(booking) {
  if (booking.cancelledAt) {
    return 'cancelled'
  }

  if (WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)) {
    if (booking.wardenStatus === 'approved') {
      return 'approved'
    }

    if (booking.wardenStatus === 'rejected') {
      return 'not approved'
    }

    return 'pending warden'
  }

  if (booking.academicStatus === 'rejected' || booking.wardenStatus === 'rejected') {
    return 'not approved'
  }

  if (booking.academicStatus === 'pending') {
    return 'pending academic'
  }

  if (booking.wardenStatus === 'pending') {
    return 'pending warden'
  }

  if (booking.academicStatus === 'approved' && booking.wardenStatus === 'approved') {
    return 'approved'
  }

  return 'in review'
}

export function isFinalApproved(booking) {
  return getCurrentStatus(booking) === 'approved'
}

export function shouldCountAgainstDays(booking) {
  const status = getCurrentStatus(booking)
  return status !== 'not approved' && status !== 'cancelled'
}

export function datesOverlap(aStart, aEnd, bStart, bEnd) {
  const startA = startOfDay(new Date(aStart))
  const endA = startOfDay(new Date(aEnd))
  const startB = startOfDay(new Date(bStart))
  const endB = startOfDay(new Date(bEnd))

  return startA <= endB && startB <= endA
}

export function getAvailableBeds(bookings, checkIn, checkOut, ignoreBookingId = '', gender = '') {
  const availability = []
  const allowedRoomNumbers = getRoomNumbersForGender(gender)

  for (const roomNumber of allowedRoomNumbers) {
    for (let bedNumber = 1; bedNumber <= BEDS_PER_ROOM; bedNumber += 1) {
      const occupied = bookings.some((booking) => {
        if (!isFinalApproved(booking) || booking.id === ignoreBookingId) {
          return false
        }

        if (booking.roomNumber !== roomNumber || booking.bedNumber !== bedNumber) {
          return false
        }

        if (!checkIn || !checkOut) {
          return true
        }

        return datesOverlap(booking.checkIn, booking.checkOut, checkIn, checkOut)
      })

      if (!occupied) {
        availability.push({
          id: `R${roomNumber}-B${bedNumber}`,
          roomNumber,
          bedNumber,
        })
      }
    }
  }

  return availability
}

export function getRoomNumbersForGender(gender) {
  if (gender === 'Female') {
    return FEMALE_ROOM_NUMBERS
  }

  if (gender === 'Male') {
    return MALE_ROOM_NUMBERS
  }

  return Array.from({ length: TOTAL_ROOMS }, (_, index) => index + 1)
}

function buildScanTimestamp(dayOffset, hours, minutes, seconds) {
  const date = addDays(startOfDay(new Date()), dayOffset)
  date.setHours(hours, minutes, seconds, 0)
  return date.toISOString()
}
