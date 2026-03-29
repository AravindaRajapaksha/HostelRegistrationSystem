import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './App.css'
import {
  ACADEMIC_ACTIVITY_OPTIONS,
  BEDS_PER_ROOM,
  CONTACTS,
  DAILY_FEE,
  DEPARTMENT_OPTIONS,
  SUBJECT_OPTIONS,
  TOTAL_ROOMS,
  WARDEN_ONLY_WORKFLOWS,
  YEAR_STAY_LIMIT,
  calculatePaymentTotal,
  calculateRequestedDays,
  createDemoScanLogs,
  createInitialState,
  createQrValue,
  datesOverlap,
  getBookingYear,
  getAvailableBeds,
  getCurrentStatus,
  getRoomNumbersForGender,
  isPaymentComplete,
  shouldCountAgainstDays,
  toIsoDate,
} from './data'
import {
  addBookingClearances,
  addBookingReviewLogs,
  addScanLogs,
  clearQrScanLogs,
  ensureBookingStorageReady,
  loadSupabaseAppState,
  saveBooking,
  saveBookings,
  saveUserProfile,
  usesSupabaseBackend,
} from './lib/appStateStore'

const STORAGE_KEY = 'hostel-system-demo-state-v1'
const SESSION_KEY = 'hostel-system-demo-session-v1'
const TRF_RULES_PDF = encodeURI('/TRF - Rules and Regulations.pdf')
const DEFAULT_IOT_LOG_URL = String(import.meta.env.VITE_IOT_LOG_URL ?? '').trim()

function scrollPageToTop(behavior = 'smooth') {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior,
  })
}

function App() {
  const usingSupabase = usesSupabaseBackend()
  const [appState, setAppState] = useState(loadState)
  const [session, setSession] = useState(null)
  const [activeView, setActiveView] = useState('home')
  const [feedback, setFeedback] = useState(
    'Use one of the demo accounts below to explore the TRF hostel workflow.',
  )

  const currentUser = appState.users.find((user) => user.username === session?.username) ?? null

  const fetchRemoteState = useCallback(async (iotLogUrl = appState.iotLogUrl ?? '') => {
    return resolveAppState(
      await loadSupabaseAppState({ iotLogUrl: resolveIotLogUrl(iotLogUrl) }),
    )
  }, [appState.iotLogUrl])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState))
  }, [appState])

  useEffect(() => {
    if (!usingSupabase) {
      return
    }

    let isCancelled = false

    async function hydrateFromSupabase() {
      try {
        const remoteState = await fetchRemoteState()

        if (isCancelled) {
          return
        }

        setAppState(remoteState)
        setFeedback('Live Supabase data loaded. Seeded portal accounts are ready to use.')
      } catch (error) {
        if (isCancelled) {
          return
        }

        setFeedback(
          `${error.message} The app is still available with the current local data while we fix the connection.`,
        )
      }
    }

    hydrateFromSupabase()

    return () => {
      isCancelled = true
    }
  }, [fetchRemoteState, usingSupabase])

  useEffect(() => {
    if (!usingSupabase) {
      return
    }

    let syncInProgress = false

    async function syncFromSupabaseOnFocus() {
      if (document.visibilityState === 'hidden' || syncInProgress) {
        return
      }

      syncInProgress = true

      try {
        const remoteState = await fetchRemoteState()
        setAppState(remoteState)
      } catch {
        // Keep the existing in-memory state if the live refresh is temporarily unavailable.
      } finally {
        syncInProgress = false
      }
    }

    window.addEventListener('focus', syncFromSupabaseOnFocus)
    document.addEventListener('visibilitychange', syncFromSupabaseOnFocus)

    return () => {
      window.removeEventListener('focus', syncFromSupabaseOnFocus)
      document.removeEventListener('visibilitychange', syncFromSupabaseOnFocus)
    }
  }, [fetchRemoteState, usingSupabase])

  useEffect(() => {
    if (session && currentUser) {
      window.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ username: session.username, activeView }),
      )
      return
    }

    window.localStorage.removeItem(SESSION_KEY)
  }, [activeView, currentUser, session])

  async function handleLogin({ username, password }) {
    let usersForLogin = appState.users

    if (usingSupabase) {
      try {
        const remoteState = await fetchRemoteState()
        setAppState(remoteState)
        usersForLogin = remoteState.users
      } catch (error) {
        setFeedback(`${error.message} Using the current local data for login.`)
      }
    }

    const normalizedUsername = username.trim().toLowerCase()
    const user = usersForLogin.find(
      (entry) =>
        entry.username.toLowerCase() === normalizedUsername && entry.password === password.trim(),
    )

    if (!user) {
      setFeedback('That username and password combination was not found in the demo data.')
      return
    }

    const nextView = getDefaultView()
    setSession({ username: user.username })
    setActiveView(nextView)
    setFeedback(`Welcome, ${user.name}. You are signed in as ${user.roleLabel}.`)
    window.requestAnimationFrame(() => {
      scrollPageToTop('auto')
    })
  }

  function handleLogout() {
    setSession(null)
    setActiveView('home')
    setFeedback('You have been logged out of the demo.')
    window.requestAnimationFrame(() => {
      scrollPageToTop('auto')
    })
  }

  async function submitBooking(formValues) {
    if (!currentUser || currentUser.roleGroup !== 'student') {
      return
    }

    const selectedSubjects = normalizeSubjectValues(formValues.courseCode)

    if (!formValues.checkIn || !formValues.checkOut) {
      setFeedback('Choose both the check-in date and check-out date before creating a booking.')
      return
    }

    if (!formValues.homePhone.trim() || !formValues.mobilePhone.trim()) {
      setFeedback('Add both the home contact number and mobile contact number before submitting.')
      return
    }

    if (formValues.workflow === 'regular' && !formValues.department) {
      setFeedback(
        'Select the department for the academic TRF booking request.',
      )
      return
    }

    if (formValues.workflow === 'regular' && !selectedSubjects.length) {
      setFeedback(
        'Select the subject code before submitting the academic TRF booking request.',
      )
      return
    }

    if (formValues.workflow === 'regular' && !formValues.academicActivity.trim()) {
      setFeedback('Select the academic activity before submitting the academic TRF booking request.')
      return
    }

    if (formValues.workflow === 'special' && !formValues.specialReason.trim()) {
      setFeedback('Enter the special reason before submitting the special reason TRF booking request.')
      return
    }

    const requestedDays = calculateRequestedDays(formValues.checkIn, formValues.checkOut)
    const remainingDays = getRemainingDays(currentUser, appState.bookings)

    if (!requestedDays) {
      setFeedback('Choose a valid check-in and check-out date before creating a booking.')
      return
    }

    if (requestedDays > remainingDays) {
      setFeedback(
        `This request needs ${requestedDays} day(s), but the student only has ${remainingDays} day(s) remaining this year.`,
      )
      return
    }

    const availableBeds = getAvailableBeds(
      appState.bookings,
      formValues.checkIn,
      formValues.checkOut,
      '',
      currentUser.gender,
    )
    const selectedBed = availableBeds.find(
      (bed) =>
        bed.roomNumber === Number(formValues.roomNumber) &&
        bed.bedNumber === Number(formValues.bedNumber),
    )

    if (!selectedBed) {
      setFeedback('That room and bed are no longer available for the selected dates.')
      return
    }

    const bookingId = createBookingId()
    const academicApprover =
      formValues.workflow === 'regular'
        ? getPrimaryAcademicApprover(appState.users, formValues.department)
        : null
    const booking = {
      id: bookingId,
      createdAt: toIsoDate(new Date()),
      workflow: formValues.workflow,
      studentUsername: currentUser.username,
      checkIn: formValues.checkIn,
      checkOut: formValues.checkOut,
      requestedDays,
      roomNumber: Number(formValues.roomNumber),
      bedNumber: Number(formValues.bedNumber),
      academicApproverUsername: academicApprover?.username ?? '',
      academicStatus: formValues.workflow === 'regular' ? 'pending' : 'not_required',
      academicReviewedBy: '',
      academicReviewedAt: '',
      wardenApproverUsername: '',
      wardenStatus: 'pending',
      wardenReviewedBy: '',
      wardenReviewedAt: '',
      department: formValues.department,
      courseCode: selectedSubjects.join(', '),
      academicActivity: formValues.workflow === 'regular' ? formValues.academicActivity : '',
      specialReason: formValues.workflow === 'special' ? formValues.specialReason : '',
      specialFeedbackRecipients: [],
      specialFeedbackRequestedBy: '',
      specialFeedbackRequestedAt: '',
      specialFeedbackEntries: [],
      homePhone: formValues.homePhone,
      mobilePhone: formValues.mobilePhone,
      paymentTotal: calculatePaymentTotal(requestedDays),
      paymentStatus: 'unpaid',
      paymentPaidAt: '',
      academicDecisionReason: '',
      wardenDecisionReason: '',
      qrValue: createQrValue(bookingId, currentUser.username),
      cancelledAt: '',
      studentClearedAt: '',
    }

    try {
      if (usingSupabase) {
        await saveBooking(booking)
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => resolveAppState({
      ...previous,
      bookings: [booking, ...previous.bookings],
    }))
    setActiveView('bookings')
    setFeedback(`Booking ${booking.id} was created and routed for approval.`)
  }

  async function createEmergencyBooking(formValues) {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      return false
    }

    const normalizedStudentNumber = String(formValues.studentNumber ?? '').trim().toLowerCase()
    const normalizedRegistrationNumber = String(formValues.registrationNumber ?? '').trim()
    const normalizedName = String(formValues.name ?? '').trim()
    const normalizedGender = String(formValues.gender ?? '').trim()
    const normalizedHomePhone = String(formValues.homePhone ?? '').trim()
    const normalizedMobilePhone = String(formValues.mobilePhone ?? '').trim()
    const normalizedReason = String(formValues.specialReason ?? '').trim()

    if (!normalizedStudentNumber) {
      setFeedback('Enter the student number before creating the emergency permission booking.')
      return false
    }

    if (!normalizedRegistrationNumber) {
      setFeedback('Enter the registration number before creating the emergency permission booking.')
      return false
    }

    if (!normalizedName) {
      setFeedback('Enter the student name before creating the emergency permission booking.')
      return false
    }

    if (!normalizedGender) {
      setFeedback('Select the student gender before creating the emergency permission booking.')
      return false
    }

    if (!formValues.checkIn || !formValues.checkOut) {
      setFeedback('Choose both the check-in date and check-out date before creating the emergency permission booking.')
      return false
    }

    if (!normalizedHomePhone || !normalizedMobilePhone) {
      setFeedback('Add both the home contact number and mobile contact number before creating the emergency permission booking.')
      return false
    }

    if (!normalizedReason) {
      setFeedback('Enter the emergency reason before creating the emergency permission booking.')
      return false
    }

    const requestedDays = calculateRequestedDays(formValues.checkIn, formValues.checkOut)

    if (!requestedDays) {
      setFeedback('Choose a valid check-in and check-out date before creating the emergency permission booking.')
      return false
    }

    const availableBeds = getAvailableBeds(
      appState.bookings,
      formValues.checkIn,
      formValues.checkOut,
      '',
      normalizedGender,
    ).filter((bed) => getVisibleRoomNumbersForWarden(currentUser).includes(bed.roomNumber))
    const selectedBed = availableBeds.find(
      (bed) =>
        bed.roomNumber === Number(formValues.roomNumber) &&
        bed.bedNumber === Number(formValues.bedNumber),
    )

    if (!selectedBed) {
      setFeedback('That room and bed are no longer available for the selected dates.')
      return false
    }

    const existingStudent = findStudentByEmergencyIdentity(
      appState.users,
      normalizedStudentNumber,
      normalizedRegistrationNumber,
    )
    const studentUsername = existingStudent?.username ?? normalizedStudentNumber
    const nextStudent = {
      username: studentUsername,
      password: existingStudent?.password ?? studentUsername,
      roleGroup: 'student',
      roleLabel: 'Student',
      department: String(formValues.department ?? '').trim() || existingStudent?.department || '',
      managedGender: '',
      gender: normalizedGender,
      name: normalizedName,
      studentNumber: normalizedStudentNumber,
      registrationNumber: normalizedRegistrationNumber,
      faculty: String(formValues.faculty ?? '').trim() || existingStudent?.faculty || '',
      degreeProgram: String(formValues.degreeProgram ?? '').trim() || existingStudent?.degreeProgram || '',
      email: String(formValues.email ?? '').trim() || existingStudent?.email || '',
      address: String(formValues.address ?? '').trim() || existingStudent?.address || '',
      homePhone: normalizedHomePhone,
      mobilePhone: normalizedMobilePhone,
    }

    const bookingId = createBookingId()
    const booking = {
      id: bookingId,
      createdAt: toIsoDate(new Date()),
      workflow: 'emergency',
      studentUsername,
      checkIn: formValues.checkIn,
      checkOut: formValues.checkOut,
      requestedDays,
      roomNumber: Number(formValues.roomNumber),
      bedNumber: Number(formValues.bedNumber),
      academicApproverUsername: '',
      academicStatus: 'not_required',
      academicReviewedBy: '',
      academicReviewedAt: '',
      wardenApproverUsername: currentUser.username,
      wardenStatus: 'pending',
      wardenReviewedBy: '',
      wardenReviewedAt: '',
      department: formValues.department,
      courseCode: '',
      academicActivity: '',
      specialReason: normalizedReason,
      specialFeedbackRecipients: [],
      specialFeedbackRequestedBy: '',
      specialFeedbackRequestedAt: '',
      specialFeedbackEntries: [],
      homePhone: normalizedHomePhone,
      mobilePhone: normalizedMobilePhone,
      paymentTotal: calculatePaymentTotal(requestedDays),
      paymentStatus: 'unpaid',
      paymentPaidAt: '',
      academicDecisionReason: '',
      wardenDecisionReason: '',
      qrValue: createQrValue(bookingId, studentUsername),
      cancelledAt: '',
      studentClearedAt: '',
    }

    try {
      if (usingSupabase) {
        await ensureBookingStorageReady({ workflow: 'emergency' })
        await saveUserProfile(nextStudent)
        await saveBooking(booking)
      }
    } catch (error) {
      setFeedback(error.message)
      return false
    }

    setAppState((previous) => resolveAppState({
      ...previous,
      users: upsertUser(previous.users, nextStudent),
      bookings: [booking, ...previous.bookings],
    }))
    setActiveView('emergency')
    setFeedback(
      existingStudent
        ? `Emergency booking ${bookingId} was created for ${nextStudent.name} and routed for warden approval.`
        : `Emergency student ${nextStudent.name} was added and booking ${bookingId} was routed for warden approval.`,
    )
    return true
  }

  async function decideAcademic(bookingId, decision, reason = '') {
    if (!currentUser || currentUser.roleGroup !== 'academic') {
      return
    }

    const targetBooking = appState.bookings.find(
      (booking) => booking.id === bookingId && booking.academicStatus === 'pending',
    )

    if (!targetBooking || !canAcademicUserReviewBooking(currentUser, targetBooking)) {
      setFeedback('This academic request is not assigned to your department review team.')
      return
    }

    if (decision === 'rejected' && !reason.trim()) {
      setFeedback('Add the not-approved reason before rejecting the booking request.')
      return
    }

    const reviewedAt = new Date().toISOString()
    const nextReviewLog = {
      bookingId,
      stage: 'academic',
      action: decision,
      actorUsername: currentUser.username,
      decisionReason: decision === 'rejected' ? reason.trim() : '',
      actionAt: reviewedAt,
    }
    const nextReviewLogs = upsertBookingReviewLog(appState.reviewLogs ?? [], nextReviewLog)
    const updatedBooking = applyAcademicReviewState(
      {
        ...targetBooking,
        academicReviewedBy: currentUser.username,
        academicReviewedAt: reviewedAt,
        academicDecisionReason: decision === 'rejected' ? reason.trim() : '',
      },
      appState.users,
      nextReviewLogs,
    )

    try {
      if (usingSupabase) {
        await saveBooking(updatedBooking)
        await addBookingReviewLogs([nextReviewLog])
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => resolveAppState({
      ...previous,
      reviewLogs: upsertBookingReviewLog(previous.reviewLogs ?? [], nextReviewLog),
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.academicStatus !== 'pending') {
          return booking
        }

        return updatedBooking
      }),
    }))

    const refreshedBooking = applyAcademicReviewState(updatedBooking, appState.users, nextReviewLogs)

    setFeedback(
      refreshedBooking.academicStatus === 'approved'
        ? `Academic approval recorded for ${bookingId}. The request is now ready for warden review.`
        : decision === 'approved'
          ? `Academic approval recorded for ${bookingId}.`
          : `Academic rejection recorded for ${bookingId}. The request will not move to warden review.`,
    )
  }

  async function submitSpecialFeedback(bookingId, message) {
    if (!currentUser || currentUser.roleGroup !== 'academic') {
      return
    }

    const targetBooking = appState.bookings.find((booking) => booking.id === bookingId)

    if (!targetBooking || !canAcademicUserProvideSpecialFeedback(currentUser, targetBooking)) {
      setFeedback('This warden feedback request is not assigned to your account.')
      return
    }

    const trimmedMessage = message.trim()

    if (!trimmedMessage) {
      setFeedback('Enter the feedback before sending it to the warden.')
      return
    }

    const providedAt = new Date().toISOString()
    const nextEntry = {
      actorUsername: currentUser.username,
      message: trimmedMessage,
      providedAt,
    }
    const updatedBooking = {
      ...targetBooking,
      specialFeedbackEntries: upsertSpecialFeedbackEntry(targetBooking.specialFeedbackEntries, nextEntry),
    }

    try {
      if (usingSupabase) {
        await saveBooking(updatedBooking)
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId) {
          return booking
        }

        return updatedBooking
      }),
    }))

    setFeedback(`Feedback for ${bookingId} was sent to the warden.`)
  }

  async function decideWarden(bookingId, decision, reason = '', specialFeedbackRecipients = []) {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      return
    }

    if (decision === 'rejected' && !reason.trim()) {
      setFeedback('Add the not-approved reason before rejecting the booking request.')
      return
    }

    const targetBooking = appState.bookings.find(
      (booking) => booking.id === bookingId && booking.wardenStatus === 'pending',
    )

    if (!targetBooking) {
      return
    }

    const normalizedFeedbackRecipients = normalizeSpecialFeedbackRecipients(specialFeedbackRecipients, targetBooking.department)

    if (decision === 'approved' && WARDEN_ONLY_WORKFLOWS.includes(targetBooking.workflow)) {
      if (!normalizedFeedbackRecipients.length) {
        setFeedback('Select at least one academic staff member who should send feedback on this warden-approved booking.')
        return
      }

      const candidateUsernames = new Set(
        getSpecialFeedbackCandidateUsers(appState.users, targetBooking).map((user) => user.username),
      )
      const recipientIsValid = normalizedFeedbackRecipients.every((username) => candidateUsernames.has(username))

      if (!recipientIsValid) {
        setFeedback('Select valid academic staff members for the feedback request.')
        return
      }
    }

    const reviewedAt = new Date().toISOString()
    const autoRejectReason =
      'Automatically not approved because another overlapping request for this room and bed was approved first.'
    const updatedBookings = appState.bookings.map((booking) => {
      if (booking.id === bookingId) {
        const assignSpecialFeedback =
          WARDEN_ONLY_WORKFLOWS.includes(targetBooking.workflow) && decision === 'approved'
        const clearSpecialFeedback =
          WARDEN_ONLY_WORKFLOWS.includes(targetBooking.workflow) && decision === 'rejected'

        return {
          ...booking,
          wardenStatus: decision,
          wardenReviewedBy: currentUser.username,
          wardenReviewedAt: reviewedAt,
          wardenDecisionReason: decision === 'rejected' ? reason.trim() : '',
          specialFeedbackRecipients: assignSpecialFeedback
            ? normalizedFeedbackRecipients
            : clearSpecialFeedback
              ? []
              : normalizeSpecialFeedbackRecipients(booking.specialFeedbackRecipients, booking.department),
          specialFeedbackRequestedBy: assignSpecialFeedback
            ? currentUser.username
            : clearSpecialFeedback
              ? ''
              : booking.specialFeedbackRequestedBy ?? '',
          specialFeedbackRequestedAt: assignSpecialFeedback
            ? reviewedAt
            : clearSpecialFeedback
              ? ''
              : booking.specialFeedbackRequestedAt ?? '',
          specialFeedbackEntries: assignSpecialFeedback || clearSpecialFeedback
            ? []
            : normalizeSpecialFeedbackEntries(booking.specialFeedbackEntries, booking.department),
        }
      }

      if (
        decision === 'approved' &&
        booking.wardenStatus === 'pending' &&
        !booking.cancelledAt &&
        booking.roomNumber === targetBooking.roomNumber &&
        booking.bedNumber === targetBooking.bedNumber &&
        datesOverlap(booking.checkIn, booking.checkOut, targetBooking.checkIn, targetBooking.checkOut)
      ) {
        return {
          ...booking,
          wardenStatus: 'rejected',
          wardenReviewedBy: currentUser.username,
          wardenReviewedAt: reviewedAt,
          wardenDecisionReason: autoRejectReason,
        }
      }

      return booking
    })

    const changedBookings = updatedBookings.filter((booking, index) => booking !== appState.bookings[index])
    const reviewLogs = [
      {
        bookingId,
        stage: 'warden',
        action: decision,
        actorUsername: currentUser.username,
        decisionReason: decision === 'rejected' ? reason.trim() : '',
        actionAt: reviewedAt,
      },
      ...changedBookings
        .filter((booking) => booking.id !== bookingId && booking.wardenDecisionReason === autoRejectReason)
        .map((booking) => ({
          bookingId: booking.id,
          stage: 'warden',
          action: 'rejected',
          actorUsername: currentUser.username,
          decisionReason: autoRejectReason,
          actionAt: reviewedAt,
        })),
    ]

    try {
      if (usingSupabase) {
        await saveBookings(changedBookings)
        await addBookingReviewLogs(reviewLogs)
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        const updatedBooking = changedBookings.find((entry) => entry.id === booking.id)
        return updatedBooking ?? booking
      }),
    }))

    const selectedFeedbackRecipients = appState.users.filter((user) =>
      normalizedFeedbackRecipients.includes(user.username),
    )

    setFeedback(
      decision === 'approved'
        ? WARDEN_ONLY_WORKFLOWS.includes(targetBooking.workflow)
          ? `Warden approval recorded for ${bookingId}. ${selectedFeedbackRecipients.length} selected academic staff member(s) can now send feedback back to the warden.`
          : `Warden approval recorded for ${bookingId}. Availability was updated for overlapping requests.`
        : `Warden rejection recorded for ${bookingId} with the not-approved reason.`,
    )
  }

  async function payBooking(bookingId) {
    if (!currentUser || currentUser.roleGroup !== 'student') {
      return
    }

    const targetBooking = appState.bookings.find(
      (booking) => booking.id === bookingId && booking.studentUsername === currentUser.username,
    )

    if (!targetBooking) {
      return
    }

    const updatedBooking = {
      ...targetBooking,
      paymentStatus: 'paid',
      paymentPaidAt: new Date().toISOString(),
    }
    const updatedBookings = appState.bookings.map((booking) => {
      if (booking.id !== bookingId || booking.studentUsername !== currentUser.username) {
        return booking
      }

      return updatedBooking
    })

    try {
      if (usingSupabase) {
        await saveBooking(updatedBooking)
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: updatedBookings,
    }))

    const iotSyncResult = await syncApprovedBookingsToIot({ bookings: updatedBookings, silent: true })

    setFeedback(
      iotSyncResult.attempted && iotSyncResult.cleared
        ? `Payment completed for ${bookingId}. The QR code is now available and synced to the ESP32 scanner.`
        : `Payment completed for ${bookingId}. The QR code is now available.`,
    )
  }

  async function recordEmergencyPayment(bookingId) {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      return
    }

    const targetBooking = appState.bookings.find(
      (booking) =>
        booking.id === bookingId &&
        booking.workflow === 'emergency' &&
        canWardenUserReviewBooking(currentUser, booking),
    )

    if (!targetBooking) {
      return
    }

    if (getCurrentStatus(targetBooking) !== 'approved' || isPaymentComplete(targetBooking)) {
      setFeedback(`Payment cannot be recorded for ${bookingId} right now.`)
      return
    }

    const updatedBooking = {
      ...targetBooking,
      paymentStatus: 'paid',
      paymentPaidAt: new Date().toISOString(),
    }
    const updatedBookings = appState.bookings.map((booking) => (booking.id === bookingId ? updatedBooking : booking))

    try {
      if (usingSupabase) {
        await saveBooking(updatedBooking)
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: updatedBookings,
    }))

    const iotSyncResult = await syncApprovedBookingsToIot({ bookings: updatedBookings, silent: true })

    setFeedback(
      iotSyncResult.attempted && iotSyncResult.cleared
        ? `Emergency payment completed for ${bookingId}. The QR code is now available and synced to the ESP32 scanner.`
        : `Emergency payment completed for ${bookingId}. The QR code is now available.`,
    )
  }

  async function cancelBooking(bookingId) {
    if (!currentUser || currentUser.roleGroup !== 'student') {
      return
    }

    const targetBooking = appState.bookings.find(
      (booking) => booking.id === bookingId && booking.studentUsername === currentUser.username,
    )

    if (!targetBooking) {
      return
    }

    const status = getCurrentStatus(targetBooking)

    if (
      targetBooking.cancelledAt ||
      isPaymentComplete(targetBooking) ||
      status !== 'pending academic'
    ) {
      setFeedback(`Booking ${bookingId} cannot be cancelled anymore.`)
      return
    }

    const updatedBooking = {
      ...targetBooking,
      cancelledAt: new Date().toISOString(),
    }

    try {
      if (usingSupabase) {
        await saveBooking(updatedBooking)
      }
    } catch (error) {
      setFeedback(error.message)
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.studentUsername !== currentUser.username) {
          return booking
        }

        return updatedBooking
      }),
    }))

    setFeedback(`Booking ${bookingId} was cancelled successfully.`)
  }

  async function clearStudentBookingHistory(bookingId) {
    return clearStudentBookingHistoryEntries([bookingId])
  }

  async function clearStudentBookingHistoryEntries(bookingIds) {
    if (!currentUser || currentUser.roleGroup !== 'student') {
      return 0
    }

    const requestedBookingIds = [...new Set(bookingIds)]
    const candidateBookings = appState.bookings.filter(
      (booking) =>
        requestedBookingIds.includes(booking.id) &&
        booking.studentUsername === currentUser.username &&
        !booking.studentClearedAt,
    )

    if (!candidateBookings.length) {
      if (requestedBookingIds.length === 1) {
        setFeedback(`Booking ${requestedBookingIds[0]} cannot be cleared from history yet.`)
      } else {
        setFeedback('No clearable student history rows were found.')
      }
      return 0
    }

    const clearableBookings = candidateBookings.filter(canStudentClearBookingHistory)

    if (!clearableBookings.length) {
      if (requestedBookingIds.length === 1) {
        setFeedback(`Booking ${requestedBookingIds[0]} cannot be cleared from history yet.`)
      } else {
        setFeedback('No clearable student history rows were found.')
      }
      return 0
    }

    const clearedAt = new Date().toISOString()
    const updatedBookings = clearableBookings.map((booking) => ({
      ...booking,
      studentClearedAt: clearedAt,
    }))
    const updatedBookingMap = new Map(updatedBookings.map((booking) => [booking.id, booking]))

    try {
      if (usingSupabase) {
        await saveBookings(updatedBookings)
      }
    } catch (error) {
      setFeedback(error.message)
      return 0
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        return updatedBookingMap.get(booking.id) ?? booking
      }),
    }))

    if (updatedBookings.length === 1 && requestedBookingIds.length === 1) {
      setFeedback(`Booking ${updatedBookings[0].id} was cleared from your history.`)
      return 1
    }

    const skippedCount = candidateBookings.length - updatedBookings.length
    setFeedback(
      skippedCount
        ? `${updatedBookings.length} booking history row(s) were cleared. ${skippedCount} row(s) are still active and were kept.`
        : `${updatedBookings.length} booking history row(s) were cleared from your history.`,
    )
    return updatedBookings.length
  }

  async function clearAcademicBookingHistory(bookingId) {
    return clearAcademicBookingHistoryEntries([bookingId])
  }

  async function clearAcademicBookingHistoryEntries(bookingIds) {
    if (!currentUser || currentUser.roleGroup !== 'academic') {
      return 0
    }

    const requestedBookingIds = [...new Set(bookingIds)]
    const targetBookings = appState.bookings.filter(
      (booking) =>
        requestedBookingIds.includes(booking.id) &&
        !isHistoryClearedForUser(booking, currentUser),
    )

    if (!targetBookings.length) {
      setFeedback('No academic history rows were available to clear.')
      return 0
    }

    const clearedAt = new Date().toISOString()

    try {
      if (usingSupabase) {
        await addBookingClearances(
          targetBookings.map((booking) => ({
            bookingId: booking.id,
            clearedByUsername: currentUser.username,
            roleGroup: 'academic',
            clearedAt,
          })),
        )
      }
    } catch (error) {
      setFeedback(error.message)
      return 0
    }

    const targetBookingIdSet = new Set(targetBookings.map((booking) => booking.id))

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (!targetBookingIdSet.has(booking.id)) {
          return booking
        }

        return {
          ...booking,
          academicClearedBy: [...new Set([...(booking.academicClearedBy ?? []), currentUser.username])],
        }
      }),
    }))

    if (targetBookings.length === 1 && requestedBookingIds.length === 1) {
      setFeedback(`Booking ${targetBookings[0].id} was cleared from your academic history.`)
      return 1
    }

    setFeedback(`${targetBookings.length} booking history row(s) were cleared from your academic history.`)
    return targetBookings.length
  }

  async function clearWardenBookingHistory(bookingId) {
    return clearWardenBookingHistoryEntries([bookingId])
  }

  async function clearWardenBookingHistoryEntries(bookingIds) {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      return 0
    }

    const requestedBookingIds = [...new Set(bookingIds)]
    const targetBookings = appState.bookings.filter(
      (booking) =>
        requestedBookingIds.includes(booking.id) &&
        !isHistoryClearedForUser(booking, currentUser),
    )

    if (!targetBookings.length) {
      setFeedback('No warden history rows were available to clear.')
      return 0
    }

    const clearedAt = new Date().toISOString()

    try {
      if (usingSupabase) {
        await addBookingClearances(
          targetBookings.map((booking) => ({
            bookingId: booking.id,
            clearedByUsername: currentUser.username,
            roleGroup: 'warden',
            clearedAt,
          })),
        )
      }
    } catch (error) {
      setFeedback(error.message)
      return 0
    }

    const targetBookingIdSet = new Set(targetBookings.map((booking) => booking.id))

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (!targetBookingIdSet.has(booking.id)) {
          return booking
        }

        return {
          ...booking,
          wardenClearedBy: [...new Set([...(booking.wardenClearedBy ?? []), currentUser.username])],
        }
      }),
    }))

    if (targetBookings.length === 1 && requestedBookingIds.length === 1) {
      setFeedback(`Booking ${targetBookings[0].id} was cleared from your warden history.`)
      return 1
    }

    setFeedback(`${targetBookings.length} booking history row(s) were cleared from your warden history.`)
    return targetBookings.length
  }

  function updateIotLogUrl(nextUrl) {
    const resolvedUrl = resolveIotLogUrl(nextUrl)

    setAppState((previous) => ({
      ...previous,
      iotLogUrl: resolvedUrl,
    }))

    if (resolvedUrl) {
      setFeedback('ESP32 log URL saved. QR confirmation sync will keep checking the device log.')
      return
    }

    setFeedback('ESP32 log URL cleared. Automatic IoT sync is now turned off.')
  }

  async function syncApprovedBookingsToIot({ targetUrl: providedUrl = '', silent = false, bookings = appState.bookings } = {}) {
    const targetUrl = resolveIotLogUrl(providedUrl || appState.iotLogUrl || '')

    if (!targetUrl) {
      if (!silent) {
        setFeedback('Add the ESP32 /view-log link first so the website can sync approved QR access to the device.')
      }

      return {
        attempted: false,
        cleared: false,
        syncedCount: 0,
      }
    }

    const allowedBookings = getApprovedPaidIotBookings(bookings)

    try {
      const parsedUrl = new URL(targetUrl)
      const clearUsersUrl = `${parsedUrl.origin}/get?delete=users`
      const clearResponse = await fetch(`/api/iot-log?url=${encodeURIComponent(clearUsersUrl)}`)

      if (!clearResponse.ok) {
        throw new Error('iot-user-clear-failed')
      }

      for (const booking of allowedBookings) {
        const addUserUrl = new URL('/get', `${parsedUrl.origin}/`)
        addUserUrl.searchParams.set('qrCode', booking.qrValue)
        addUserUrl.searchParams.set('role', 'Student')

        const addResponse = await fetch(`/api/iot-log?url=${encodeURIComponent(addUserUrl.toString())}`)

        if (!addResponse.ok) {
          throw new Error('iot-user-sync-failed')
        }
      }

      if (!silent) {
        setFeedback(
          allowedBookings.length
            ? `${allowedBookings.length} approved and paid student QR code(s) were synced to the ESP32 scanner access list.`
            : 'The ESP32 scanner access list was cleared. No approved and paid student QR codes are active right now.',
        )
      }

      return {
        attempted: true,
        cleared: true,
        syncedCount: allowedBookings.length,
      }
    } catch {
      if (!silent) {
        setFeedback('The website could not update the ESP32 approved-student list. Check the ESP32 URL and make sure both devices are on the same network.')
      }

      return {
        attempted: true,
        cleared: false,
        syncedCount: 0,
      }
    }
  }

  async function importScanLogs({ deviceName, rawLog, silent = false }) {
    const importedLogs = parseIotLogRows(rawLog, appState.bookings, appState.users, deviceName)

    if (!importedLogs.length) {
      if (!silent) {
        setFeedback('No valid IoT log rows were found in the ESP32 scanner log.')
      }
      return 0
    }

    const existingLogs = appState.scanLogs ?? []
    const seenKeys = new Set(existingLogs.map(createScanLogKey))
    const newLogs = importedLogs.filter((log) => {
      const key = createScanLogKey(log)
      if (seenKeys.has(key)) {
        return false
      }

      seenKeys.add(key)
      return true
    })

    if (!newLogs.length) {
      if (!silent) {
        setFeedback('No new IoT scan rows were found in the scanner log.')
      }
      return 0
    }

    try {
      if (usingSupabase) {
        await addScanLogs(newLogs)
      }
    } catch (error) {
      setFeedback(error.message)
      return 0
    }

    if (usingSupabase) {
      try {
        const remoteState = await fetchRemoteState(appState.iotLogUrl ?? '')
        setAppState(remoteState)
      } catch {
        setAppState((previous) => ({
          ...previous,
          scanLogs: mergeScanLogs(previous.scanLogs ?? [], newLogs),
        }))
      }
    } else {
      setAppState((previous) => ({
        ...previous,
        scanLogs: mergeScanLogs(previous.scanLogs ?? [], newLogs),
      }))
    }

    setFeedback(`${newLogs.length} new IoT scan confirmation row(s) were added to the warden history.`)

    return newLogs.length
  }

  async function syncIotLogFromUrl({ deviceName, silent = false, targetUrl: providedUrl = '' }) {
    const targetUrl = resolveIotLogUrl(providedUrl || appState.iotLogUrl || '')

    if (!targetUrl) {
      if (!silent) {
        setFeedback('Add the ESP32 /view-log link first so the website can read scan confirmations.')
      }
      return 0
    }

    try {
      const response = await fetch(`/api/iot-log?url=${encodeURIComponent(targetUrl)}`)
      if (!response.ok) {
        throw new Error('iot-log-request-failed')
      }

      const rawLog = await response.text()
      return importScanLogs({ deviceName, rawLog, silent })
    } catch {
      if (!silent) {
        setFeedback('The website could not reach the IoT scanner log. Check the ESP32 log URL and make sure both devices are on the same network.')
      }
      return 0
    }
  }

  async function clearIotDeviceLog(logUrl) {
    const resolvedUrl = resolveIotLogUrl(logUrl)

    if (!resolvedUrl) {
      return {
        attempted: false,
        cleared: false,
      }
    }

    try {
      const parsedUrl = new URL(resolvedUrl)
      const clearUrl = `${parsedUrl.origin}/get?delete=log`
      const response = await fetch(`/api/iot-log?url=${encodeURIComponent(clearUrl)}`)

      return {
        attempted: true,
        cleared: response.ok,
      }
    } catch {
      return {
        attempted: true,
        cleared: false,
      }
    }
  }

  async function clearQrConfirmationHistory() {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      setFeedback('Only warden accounts can clear QR confirmations.')
      return false
    }

    const configuredIotLogUrl = resolveIotLogUrl(appState.iotLogUrl)
    let deviceLogClearAttempted = false
    let deviceLogCleared = false

    try {
      if (usingSupabase) {
        await clearQrScanLogs()
        const scannerReset = await clearIotDeviceLog(configuredIotLogUrl)
        deviceLogClearAttempted = scannerReset.attempted
        deviceLogCleared = scannerReset.cleared
        const remoteState = await fetchRemoteState(configuredIotLogUrl)
        setAppState(remoteState)
      } else {
        setAppState((previous) => ({
          ...previous,
          scanLogs: [],
        }))
      }
    } catch (error) {
      setFeedback(error.message)
      return false
    }

    setFeedback(
      deviceLogCleared
        ? 'QR confirmation history was cleared from the website and the ESP32 scan log was cleared too.'
        : deviceLogClearAttempted
          ? 'QR confirmation history was cleared from the website, but the ESP32 scan log could not be cleared.'
          : 'QR confirmation history was cleared from the website.',
    )

    return true
  }

  if (!currentUser) {
    return (
      <LoginScreen
        feedback={
          session
            ? 'The previous session could not be restored, so the demo returned to login.'
            : feedback
        }
        users={appState.users}
        onLogin={handleLogin}
      />
    )
  }

  const navItems = getNavItems(currentUser.roleGroup)

  return (
    <PortalShell
      activeView={activeView}
      currentUser={currentUser}
      feedback={feedback}
      navItems={navItems}
      onLogout={handleLogout}
      onNavigate={setActiveView}
    >
      {renderView({
        activeView,
        appState,
        onCreateEmergencyBooking: createEmergencyBooking,
        currentUser,
        onAcademicDecision: decideAcademic,
        onAcademicSpecialFeedback: submitSpecialFeedback,
        onCancelBooking: cancelBooking,
        onClearAcademicBooking: clearAcademicBookingHistory,
        onClearAcademicHistory: clearAcademicBookingHistoryEntries,
        onClearStudentBooking: clearStudentBookingHistory,
        onClearStudentHistory: clearStudentBookingHistoryEntries,
        onClearWardenBooking: clearWardenBookingHistory,
        onClearWardenHistory: clearWardenBookingHistoryEntries,
        onClearQrConfirmations: clearQrConfirmationHistory,
        onPayBooking: payBooking,
        onRecordEmergencyPayment: recordEmergencyPayment,
        onSubmitBooking: submitBooking,
        onSyncIotAccess: syncApprovedBookingsToIot,
        onSyncIotLog: syncIotLogFromUrl,
        onUpdateIotLogUrl: updateIotLogUrl,
        onWardenDecision: decideWarden,
      })}
    </PortalShell>
  )
}

function renderView({
  activeView,
  appState,
  onCreateEmergencyBooking,
  currentUser,
  onAcademicDecision,
  onAcademicSpecialFeedback,
  onCancelBooking,
  onClearAcademicBooking,
  onClearAcademicHistory,
  onClearStudentBooking,
  onClearStudentHistory,
  onClearWardenBooking,
  onClearWardenHistory,
  onClearQrConfirmations,
  onPayBooking,
  onRecordEmergencyPayment,
  onSubmitBooking,
  onSyncIotAccess,
  onSyncIotLog,
  onUpdateIotLogUrl,
  onWardenDecision,
}) {
  const studentBookings = appState.bookings
    .filter((booking) => booking.studentUsername === currentUser.username)
    .sort(sortRecentFirst)

  if (currentUser.roleGroup === 'student') {
    if (activeView === 'dashboard') {
      return (
        <StudentDashboard
          bookings={studentBookings}
          student={currentUser}
        />
      )
    }

    if (activeView === 'booking') {
      return (
        <StudentBookingForm
          bookings={appState.bookings}
          student={currentUser}
          onSubmit={onSubmitBooking}
        />
      )
    }

    if (activeView === 'bookings') {
      return (
        <StudentBookingsView
          bookings={studentBookings}
          currentUser={currentUser}
          onCancel={onCancelBooking}
          onClear={onClearStudentBooking}
          onClearHistory={onClearStudentHistory}
          onPay={onPayBooking}
          users={appState.users}
        />
      )
    }

    return <HomeView currentUser={currentUser} users={appState.users} />
  }

  if (currentUser.roleGroup === 'academic') {
    const relevant = appState.bookings
      .filter((booking) => booking.workflow === 'regular')
      .filter((booking) => !booking.cancelledAt)
      .filter((booking) => canAcademicUserAccessRegularBooking(currentUser, booking))
      .sort(sortRecentFirst)
    const feedbackRelevant = appState.bookings
      .filter((booking) => !booking.cancelledAt)
      .filter((booking) => canAcademicUserProvideSpecialFeedback(currentUser, booking))
      .sort(sortRecentFirst)

    if (activeView === 'dashboard') {
      return (
        <AcademicDashboardView
          approvalBookings={relevant.filter((booking) => canAcademicUserReviewBooking(currentUser, booking))}
          currentUser={currentUser}
          feedbackBookings={feedbackRelevant}
          onSubmitFeedback={onAcademicSpecialFeedback}
          users={appState.users}
          onDecision={onAcademicDecision}
        />
      )
    }

    if (activeView === 'approved') {
      return (
        <DecisionListView
          bookings={relevant.filter((booking) => getAcademicDecisionForUser(booking, currentUser) === 'approved')}
          onClear={onClearAcademicBooking}
          onClearHistory={onClearAcademicHistory}
          currentUser={currentUser}
          emptyCopy="No approved requests are available yet."
          title="Approved Requests"
          users={appState.users}
        />
      )
    }

    if (activeView === 'rejected') {
      return (
        <DecisionListView
          bookings={relevant.filter((booking) => getAcademicDecisionForUser(booking, currentUser) === 'rejected')}
          onClear={onClearAcademicBooking}
          onClearHistory={onClearAcademicHistory}
          currentUser={currentUser}
          emptyCopy="No not-approved requests are available yet."
          title="Not-Approved Requests"
          users={appState.users}
        />
      )
    }

    return <HomeView currentUser={currentUser} users={appState.users} />
  }

  const relevant = appState.bookings
    .filter((booking) => !booking.cancelledAt)
    .filter((booking) => canWardenUserReviewBooking(currentUser, booking))
    .sort(sortRecentFirst)

  if (activeView === 'dashboard') {
    return (
      <WardenDashboardView
        bookings={relevant.filter(
          (booking) =>
            booking.workflow === 'regular' &&
            booking.academicStatus === 'approved' &&
            booking.wardenStatus === 'pending',
        )}
        currentUser={currentUser}
        users={appState.users}
        onDecision={onWardenDecision}
      />
    )
  }

  if (activeView === 'special') {
    return (
      <WardenDashboardView
        bookings={relevant.filter(
          (booking) => booking.workflow === 'special' && booking.wardenStatus === 'pending',
        )}
        currentUser={currentUser}
        users={appState.users}
        onDecision={onWardenDecision}
        title="Warden-Only Notifications"
      />
    )
  }

  if (activeView === 'details') {
    return (
      <DecisionListView
        bookings={relevant.filter((booking) => getCurrentStatus(booking) === 'approved')}
        onClear={onClearWardenBooking}
        onClearHistory={onClearWardenHistory}
        currentUser={currentUser}
        emptyCopy="No approved TRF student details are available yet."
        title="TRF Student Details"
        users={appState.users}
      />
    )
  }

  if (activeView === 'rejected') {
    return (
      <DecisionListView
        bookings={relevant.filter((booking) => getCurrentStatus(booking) === 'not approved')}
        onClear={onClearWardenBooking}
        onClearHistory={onClearWardenHistory}
        currentUser={currentUser}
        emptyCopy="No not-approved requests are available yet."
        title="Not-Approved Requests"
        users={appState.users}
      />
    )
  }

  if (activeView === 'confirmations') {
    return (
      <ScanConfirmationsView
        bookings={appState.bookings}
        currentUser={currentUser}
        iotLogUrl={appState.iotLogUrl ?? ''}
        onClearConfirmations={onClearQrConfirmations}
        onSyncIotAccess={onSyncIotAccess}
        onSyncIotLog={onSyncIotLog}
        onUpdateIotLogUrl={onUpdateIotLogUrl}
        scanLogs={appState.scanLogs ?? []}
        users={appState.users}
      />
    )
  }

  if (activeView === 'emergency') {
    return (
      <EmergencyPermissionView
        allBookings={appState.bookings}
        bookings={relevant.filter((booking) => booking.workflow === 'emergency')}
        currentUser={currentUser}
        onClear={onClearWardenBooking}
        onClearHistory={onClearWardenHistory}
        onCreate={onCreateEmergencyBooking}
        onDecision={onWardenDecision}
        onPay={onRecordEmergencyPayment}
        title="Emergency Permission"
        users={appState.users}
      />
    )
  }

  return <HomeView currentUser={currentUser} users={appState.users} />
}

function LoginScreen({ users, onLogin }) {
  const [credentials, setCredentials] = useState({
    username: 's23000427',
    password: 's23000427',
  })

  const groupedUsers = {
    student: users.filter((user) => user.roleGroup === 'student'),
    warden: users.filter((user) => user.roleGroup === 'warden'),
    academic: users.filter((user) => user.roleGroup === 'academic'),
  }

  return (
    <main className="login-shell">
      <section className="login-panel login-panel-full">
        <div className="login-intro">
          <div className="eyebrow">Hostel Booking Login</div>
          <h1>Temporary Residential Facility (TRF)</h1>
        </div>
        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault()
            onLogin(credentials)
          }}
        >
          <h2>Login</h2>
          <Field
            label="Username"
            name="username"
            value={credentials.username}
            onChange={(value) => setCredentials((previous) => ({ ...previous, username: value }))}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            value={credentials.password}
            onChange={(value) => setCredentials((previous) => ({ ...previous, password: value }))}
          />

          <div className="button-row">
            <button className="primary-button login-submit-button" type="submit">
              Login
            </button>
          </div>
        </form>

        <div className="credentials-grid">
          <CredentialGroup
            description="Demo accounts for student login."
            title="Students"
            users={groupedUsers.student}
            onUse={(user) => setCredentials({ username: user.username, password: user.password })}
          />
          <CredentialGroup
            description="Demo accounts for warden and sub warden login."
            title="Warden Team"
            users={groupedUsers.warden}
            onUse={(user) => setCredentials({ username: user.username, password: user.password })}
          />
          <CredentialGroup
            description="Demo accounts for academic staff login."
            title="Academic Staff"
            users={groupedUsers.academic}
            onUse={(user) => setCredentials({ username: user.username, password: user.password })}
          />
        </div>

      </section>
    </main>
  )
}

function PortalShell({
  activeView,
  children,
  currentUser,
  feedback,
  navItems,
  onLogout,
  onNavigate,
}) {
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  function handleConfirmLogout() {
    setIsLoggingOut(true)

    window.setTimeout(() => {
      onLogout()
    }, 1200)
  }

  useEffect(() => {
    scrollPageToTop('smooth')
  }, [activeView])

  return (
    <div className="app-shell">
      <aside className={`sidebar${isMobileMenuOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-header">
          <button
            aria-controls="mobile-primary-navigation"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            className="ghost-button mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen((previous) => !previous)}
            type="button"
          >
            <span className="sr-only">{isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}</span>
            <span className={`mobile-menu-icon${isMobileMenuOpen ? ' open' : ''}`} aria-hidden="true">
              <span className="mobile-menu-icon-line" />
              <span className="mobile-menu-icon-line" />
              <span className="mobile-menu-icon-line" />
            </span>
          </button>
        </div>

        <div className="sidebar-user-summary">
          <div className="eyebrow">Signed in as</div>
          <strong className="sidebar-user-role">{currentUser.roleLabel}</strong>
        </div>

        <nav className="nav-list" aria-label="Primary navigation" id="mobile-primary-navigation">
          {navItems.map((item) => (
            <button
              className={item.id === activeView ? 'nav-button active' : 'nav-button'}
              key={item.id}
              onClick={() => {
                setIsLogoutConfirmOpen(false)
                setIsMobileMenuOpen(false)
                onNavigate(item.id)
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {isLogoutConfirmOpen ? (
            <div className="logout-confirm-card">
              <p>Are you sure you want to logout?</p>
              {isLoggingOut ? (
                <div className="logout-loading" aria-live="polite">
                  <span className="loading-spinner" aria-hidden="true" />
                  <span>Logging out...</span>
                </div>
              ) : null}
              <div className="logout-confirm-actions">
                <button
                  className="primary-button full-width"
                  disabled={isLoggingOut}
                  onClick={handleConfirmLogout}
                  type="button"
                >
                  {isLoggingOut ? 'Please wait...' : 'Confirm'}
                </button>
                <button
                  className="ghost-button full-width"
                  disabled={isLoggingOut}
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="ghost-button full-width"
              onClick={() => {
                setIsLogoutConfirmOpen(true)
                setIsMobileMenuOpen(false)
              }}
              type="button"
            >
              Logout
            </button>
          )}
        </div>
      </aside>

      <div className="content-column">
        <header className="topbar">
          <div>
            <h1>{getPageHeading(currentUser.roleGroup, activeView)}</h1>
          </div>
          <div className="topbar-user">
            <span className="topbar-user-name">{currentUser.name}</span>
            <span className="topbar-user-username">{currentUser.username}</span>
            <strong className="topbar-user-email">{currentUser.email}</strong>
          </div>
        </header>

        <div className="status-banner portal-banner">{feedback}</div>
        <section className="page-body page-transition" key={activeView}>
          {children}
        </section>
      </div>
    </div>
  )
}

function HomeView({ currentUser, users }) {
  const warden = users.find((user) => user.username === 'warden')
  const subMale = users.find((user) => user.username === 'submale')
  const subFemale = users.find((user) => user.username === 'subfemale')
  const counselor = users.find((user) => isStudentCounselor(user))

  if (currentUser.roleGroup === 'student') {
    return (
      <div className="stacked-layout">
        <section className="feature-panel">
          <div>
            <div className="eyebrow">Home</div>
            <h2>TRF Information</h2>
          </div>
          <div className="metric-strip">
            <MetricCard label="TRF Capacity" value="20 rooms, 4 beds each" />
            <MetricCard label="Year stays limit" value="60 days" />
            <MetricCard label="Daily fee" value="Rs. 50" />
          </div>
        </section>

        <section className="two-column-grid">
          <RulesPdfPanel />

          <article className="panel-card">
            <h3>Contact Information</h3>
            <div className="student-contact-stack">
              <ContactCard
                email={warden?.email ?? 'warden@trf.edu'}
                label="Warden"
                name={warden?.name ?? 'Warden'}
                phone={warden?.mobilePhone ?? CONTACTS.warden}
              />
              <ContactCard
                email={subMale?.email ?? 'subwarden.male@trf.edu'}
                label="Sub warden (Male)"
                name={subMale?.name ?? 'Sub warden (Male)'}
                phone={subMale?.mobilePhone ?? CONTACTS.subWardenMale}
              />
              <ContactCard
                email={subFemale?.email ?? 'subwarden.female@trf.edu'}
                label="Sub warden (Female)"
                name={subFemale?.name ?? 'Sub warden (Female)'}
                phone={subFemale?.mobilePhone ?? CONTACTS.subWardenFemale}
              />
            </div>
          </article>
        </section>
      </div>
    )
  }

  return (
    <div className="stacked-layout">
      <section className="feature-panel">
        <div>
          <div className="eyebrow">Home</div>
          <h2>TRF information at a glance</h2>
          <p>
            The shared home page gives every role the same overview of capacity, stay limits,
            charges, rules, and support contacts from the report.
          </p>
        </div>
        <div className="metric-strip">
          <MetricCard label="Capacity" value={`${TOTAL_ROOMS} rooms, ${TOTAL_ROOMS * BEDS_PER_ROOM} beds`} />
          <MetricCard label="Stay limit" value={`${YEAR_STAY_LIMIT} days / year`} />
          <MetricCard label="Daily fee" value={formatCurrency(DAILY_FEE)} />
        </div>
      </section>

      <section className="two-column-grid">
        <RulesPdfPanel />

        <article className="panel-card">
          <h3>Contact Information</h3>
          <div className="contact-list">
            <ContactCard
              label="Warden"
              name={warden?.name ?? 'Warden'}
              phone={warden?.mobilePhone ?? CONTACTS.warden}
              email={warden?.email ?? 'warden@trf.edu'}
            />
            <ContactCard
              label="Sub warden (Male)"
              name={subMale?.name ?? 'Sub warden (Male)'}
              phone={subMale?.mobilePhone ?? CONTACTS.subWardenMale}
              email={subMale?.email ?? 'subwarden.male@trf.edu'}
            />
            <ContactCard
              label="Sub warden (Female)"
              name={subFemale?.name ?? 'Sub warden (Female)'}
              phone={subFemale?.mobilePhone ?? CONTACTS.subWardenFemale}
              email={subFemale?.email ?? 'subwarden.female@trf.edu'}
            />
            <ContactCard
              label="Student counselor"
              name={counselor?.name ?? 'Student counselor'}
              phone={counselor?.mobilePhone ?? '077 600 7711'}
              email={counselor?.email ?? 'counselor@campus.edu'}
            />
          </div>
        </article>
      </section>
    </div>
  )
}

function RulesPdfPanel() {
  return (
    <article className="panel-card pdf-panel">
      <div className="section-heading pdf-panel-heading">
        <div>
          <h3>TRF Rules and Regulations</h3>
          <p>View the PDF below or download it for offline use.</p>
        </div>
        <a className="ghost-button pdf-download-link" download href={TRF_RULES_PDF}>
          Download PDF
        </a>
      </div>

      <div className="pdf-frame-shell">
        <iframe
          className="pdf-frame"
          src={`${TRF_RULES_PDF}#toolbar=1&navpanes=0&view=FitH`}
          title="TRF rules and regulations PDF"
        />
      </div>

      <p className="pdf-note">
        If the preview does not load in your browser,{' '}
        <a href={TRF_RULES_PDF} rel="noreferrer" target="_blank">
          open the PDF in a new tab
        </a>
        .
      </p>
    </article>
  )
}

function StudentDashboard({ bookings, student }) {
  const remainingDays = getRemainingDays(student, bookings)

  return (
    <div className="stacked-layout">
      <section className="metric-strip">
        <MetricCard label="Remaining days" value={`${remainingDays}`} />
        <MetricCard label="My bookings" value={`${bookings.length}`} />
      </section>

      <section className="two-column-grid">
        <article className="panel-card">
          <h3>Student details</h3>
          <DetailGrid
            items={[
              ['Name', student.name],
              ['Gender', student.gender],
              ['Student number (S number)', student.studentNumber ?? student.username],
              ['Registration number', student.registrationNumber ?? 'N/A'],
              ['Faculty', student.faculty],
              ['Degree program', student.degreeProgram],
              ['Email', student.email],
              ['Address', student.address],
              ['Home contact', student.homePhone],
              ['Mobile contact', student.mobilePhone],
            ]}
          />
        </article>
      </section>
    </div>
  )
}

function StudentBookingForm({ bookings, student, onSubmit }) {
  const [form, setForm] = useState(() => createInitialBookingForm(student))
  const remainingDays = getRemainingDays(student, bookings)

  const requestedDays = calculateRequestedDays(form.checkIn, form.checkOut)
  const availableBeds = getAvailableBeds(bookings, form.checkIn, form.checkOut, '', student.gender)
  const roomOptions = uniqueRoomOptions(availableBeds)
  const resolvedRoomNumber = roomOptions.some((option) => option.value === form.roomNumber)
    ? form.roomNumber
    : roomOptions[0]?.value ?? ''
  const bedOptions = availableBeds
    .filter((bed) => String(bed.roomNumber) === resolvedRoomNumber)
    .map((bed) => ({
      value: String(bed.bedNumber),
      label: `Bed ${bed.bedNumber}`,
    }))
  const resolvedBedNumber = bedOptions.some((option) => option.value === form.bedNumber)
    ? form.bedNumber
    : bedOptions[0]?.value ?? ''
  const selectedSubject = normalizeSubjectValues(form.courseCode)[0] ?? ''

  return (
    <div className="stacked-layout">
      <section className="feature-panel">
        <div>
          <div className="eyebrow">TRF Booking</div>
          <h2>Create academic or special reason hostel booking requests</h2>
          <p>
            The form follows the report: requested days, remaining days, room and bed selection,
            approval routing, payment preview, and QR code generation.
          </p>
        </div>
        <div className="metric-strip">
          <MetricCard label="Remaining days" value={`${remainingDays}`} />
          <MetricCard label="Requested days" value={`${requestedDays || 0}`} />
        </div>
      </section>

      <form
        className="panel-card form-card"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({
            ...form,
            courseCode: normalizeSubjectValues(form.courseCode),
            bedNumber: resolvedBedNumber,
            roomNumber: resolvedRoomNumber,
          })
        }}
      >
        <div className="form-heading">
          <div className="eyebrow">Hostel Booking</div>
          <h3>Choose booking type</h3>
        </div>
        <div className="form-toggle">
          <button
            className={form.workflow === 'regular' ? 'toggle active' : 'toggle'}
            onClick={() => setForm((previous) => ({ ...previous, workflow: 'regular' }))}
            type="button"
          >
            Academic TRF Booking
          </button>
          <button
            className={form.workflow === 'special' ? 'toggle active' : 'toggle'}
            onClick={() => setForm((previous) => ({ ...previous, workflow: 'special' }))}
            type="button"
          >
            Special reason TRF booking
          </button>
        </div>

        <div className="form-grid">
          <Field
            label="Check-in date"
            name="checkIn"
            type="date"
            value={form.checkIn}
            onChange={(value) => setForm((previous) => ({ ...previous, checkIn: value }))}
          />
          <Field
            label="Check-out date"
            name="checkOut"
            type="date"
            value={form.checkOut}
            onChange={(value) => setForm((previous) => ({ ...previous, checkOut: value }))}
          />
          <SelectField
            label="Room number"
            name="roomNumber"
            value={resolvedRoomNumber}
            onChange={(value) => setForm((previous) => ({ ...previous, roomNumber: value }))}
            options={roomOptions}
          />
          <SelectField
            label="Bed number"
            name="bedNumber"
            value={resolvedBedNumber}
            onChange={(value) => setForm((previous) => ({ ...previous, bedNumber: value }))}
            options={bedOptions}
          />
          <Field
            label="Home contact"
            name="homePhone"
            value={form.homePhone}
            onChange={(value) => setForm((previous) => ({ ...previous, homePhone: value }))}
          />
          <Field
            label="Mobile contact"
            name="mobilePhone"
            value={form.mobilePhone}
            onChange={(value) => setForm((previous) => ({ ...previous, mobilePhone: value }))}
          />
        </div>

        {form.workflow === 'regular' ? (
          <div className="form-grid">
            <SelectField
              label="Department"
              name="department"
              value={form.department}
              onChange={(value) => setForm((previous) => ({ ...previous, department: value }))}
              options={[
                { value: '', label: 'Select department' },
                ...DEPARTMENT_OPTIONS.map((department) => ({
                  value: department,
                  label: department,
                })),
              ]}
            />
            <SelectField
              label="Subject course code"
              name="courseCode"
              value={selectedSubject}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  courseCode: value,
                }))
              }
              options={[
                { value: '', label: 'Select subject course code' },
                ...SUBJECT_OPTIONS.map((subject) => ({
                  value: subject,
                  label: subject,
                })),
              ]}
            />
            <SelectField
              label="Academic activity"
              name="academicActivity"
              value={form.academicActivity}
              onChange={(value) => setForm((previous) => ({ ...previous, academicActivity: value }))}
              options={[
                { value: '', label: 'Select academic activity' },
                ...ACADEMIC_ACTIVITY_OPTIONS.map((activity) => ({
                  value: activity,
                  label: activity,
                })),
              ]}
            />
          </div>
        ) : (
          <div className="form-grid">
            <SelectField
              label="Department (optional)"
              name="department"
              value={form.department}
              onChange={(value) => setForm((previous) => ({ ...previous, department: value }))}
              options={[
                { value: '', label: 'Select department' },
                ...DEPARTMENT_OPTIONS.map((department) => ({
                  value: department,
                  label: department,
                })),
              ]}
            />
            <SelectField
              label="Subject course code (optional)"
              name="courseCode"
              value={selectedSubject}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  courseCode: value,
                }))
              }
              options={[
                { value: '', label: 'Select subject course code' },
                ...SUBJECT_OPTIONS.map((subject) => ({
                  value: subject,
                  label: subject,
                })),
              ]}
            />
            <TextAreaField
              label="Special reason"
              name="specialReason"
              value={form.specialReason}
              onChange={(value) => setForm((previous) => ({ ...previous, specialReason: value }))}
            />
          </div>
        )}

        <div className="button-row">
          <button className="primary-button" type="submit">
            Submit booking
          </button>
        </div>
      </form>
    </div>
  )
}

function StudentBookingsView({ bookings, currentUser, onCancel, onClear, onClearHistory, onPay, users }) {
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const visibleBookings = bookings.filter((booking) => {
    const status = getCurrentStatus(booking)
    return (
      !booking.studentClearedAt &&
      (status === 'approved' ||
        status === 'not approved' ||
        status === 'pending academic' ||
        status === 'pending warden' ||
        status === 'cancelled')
    )
  })
  const clearableBookings = visibleBookings.filter(canStudentClearBookingHistory)

  async function handleClearHistory() {
    if (!onClearHistory || !clearableBookings.length) {
      return
    }

    const shouldClear = window.confirm(
      'Clear all completed booking rows from this history? Pending rows will be kept.',
    )

    if (!shouldClear) {
      return
    }

    setIsClearingHistory(true)

    try {
      await onClearHistory(clearableBookings.map((booking) => booking.id))
    } finally {
      setIsClearingHistory(false)
    }
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">My bookings</div>
          <h2>Submitted bookings, approvals, and payment</h2>
        </div>
        {clearableBookings.length ? (
          <div className="button-row">
            <button
              className="ghost-button"
              disabled={isClearingHistory}
              onClick={handleClearHistory}
              type="button"
            >
              {isClearingHistory ? 'Clearing...' : 'Clear history'}
            </button>
          </div>
        ) : null}
      </div>

      {visibleBookings.length ? (
        <div className="card-list">
          {visibleBookings.map((booking) => {
            const status = getCurrentStatus(booking)
            const paid = isPaymentComplete(booking)
            const canCancel = !booking.cancelledAt && !paid && status === 'pending academic'
            const canClear = canStudentClearBookingHistory(booking)

            let action = null

            if (status === 'approved' && !paid) {
              action = (
                <div className="action-stack">
                  <div className="payment-panel action-panel">
                    <span>Payment required</span>
                    <strong>{formatCurrency(booking.paymentTotal)}</strong>
                    <small>Complete payment first. The QR code will be generated after payment.</small>
                  </div>
                  <div className="button-row">
                    <button className="primary-button" onClick={() => onPay(booking.id)} type="button">
                      Pay now
                    </button>
                  </div>
                </div>
              )
            }

            if (canCancel && !(status === 'approved' && !paid)) {
              action = (
                <div className="button-row">
                  <button className="ghost-button" onClick={() => onCancel(booking.id)} type="button">
                    Cancel booking
                  </button>
                </div>
              )
            }

            if (canClear) {
              action = (
                <div className="button-row">
                  <button className="ghost-button" onClick={() => onClear(booking.id)} type="button">
                    Clear row
                  </button>
                </div>
              )
            }

            return (
              <BookingCard
                action={action}
                booking={booking}
                collapsible
                currentUser={currentUser}
                key={booking.id}
                showQr={status === 'approved' && paid}
                users={users}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState copy="No submitted student bookings are available yet." />
      )}
    </section>
  )
}

function EmergencyPermissionView({
  allBookings,
  bookings,
  currentUser,
  onClear,
  onClearHistory,
  onCreate,
  onDecision,
  onPay,
  title,
  users,
}) {
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(() => createInitialEmergencyForm())
  const availableBeds = getAvailableBeds(allBookings, form.checkIn, form.checkOut, '', form.gender)
    .filter((bed) => getVisibleRoomNumbersForWarden(currentUser).includes(bed.roomNumber))
  const roomOptions = uniqueRoomOptions(availableBeds)
  const resolvedRoomNumber = roomOptions.some((option) => option.value === form.roomNumber)
    ? form.roomNumber
    : roomOptions[0]?.value ?? ''
  const bedOptions = availableBeds
    .filter((bed) => String(bed.roomNumber) === resolvedRoomNumber)
    .map((bed) => ({
      value: String(bed.bedNumber),
      label: `Bed ${bed.bedNumber}`,
    }))
  const resolvedBedNumber = bedOptions.some((option) => option.value === form.bedNumber)
    ? form.bedNumber
    : bedOptions[0]?.value ?? ''

  const pendingApprovals = bookings.filter((booking) => booking.wardenStatus === 'pending')
  const visibleRecords = bookings.filter(
    (booking) => !isHistoryClearedForUser(booking, currentUser),
  )
  const filteredRecords = filterBookings(visibleRecords, users, query)
  const clearableFilteredRecords = filteredRecords.filter(canWardenClearBookingHistory)
  const pendingPayments = visibleRecords.filter(
    (booking) => getCurrentStatus(booking) === 'approved' && !isPaymentComplete(booking),
  )
  const qrReadyRecords = visibleRecords.filter(
    (booking) => getCurrentStatus(booking) === 'approved' && isPaymentComplete(booking),
  )

  async function handleSubmit(event) {
    event.preventDefault()
    const didCreate = await onCreate({
      ...form,
      bedNumber: resolvedBedNumber,
      roomNumber: resolvedRoomNumber,
    })

    if (didCreate) {
      setForm(createInitialEmergencyForm())
      scrollPageToTop('smooth')
      return
    }

    scrollPageToTop('smooth')
  }

  async function handleClearHistory() {
    if (!onClearHistory || !clearableFilteredRecords.length) {
      return
    }

    const shouldClear = window.confirm(
      'Clear all currently visible completed emergency history rows from this page?',
    )

    if (!shouldClear) {
      return
    }

    setIsClearingHistory(true)

    try {
      await onClearHistory(clearableFilteredRecords.map((booking) => booking.id))
    } finally {
      setIsClearingHistory(false)
    }
  }

  return (
    <div className="stacked-layout">
      <section className="feature-panel">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>{title}</h2>
          <p>
            Create emergency student records, submit emergency bookings, complete warden approval,
            request academic feedback, collect payment, and release the QR code after payment.
          </p>
        </div>
        <div className="metric-strip">
          <MetricCard label="Emergency records" value={`${bookings.length}`} />
          <MetricCard label="Pending approvals" value={`${pendingApprovals.length}`} />
          <MetricCard label="Pending payments" value={`${pendingPayments.length}`} />
          <MetricCard label="QR ready" value={`${qrReadyRecords.length}`} />
        </div>
      </section>

      <form className="panel-card form-card" onSubmit={handleSubmit}>
        <div className="form-heading">
          <div className="eyebrow">Emergency Student</div>
          <h3>Create emergency student and booking</h3>
          <p className="form-note">
            Required before submit: student name, student number, registration number, gender,
            home contact, mobile contact, check-in, check-out, room, bed, and emergency reason.
          </p>
        </div>

        <div className="form-grid">
          <Field
            label="Student name (required)"
            name="name"
            required
            value={form.name}
            onChange={(value) => setForm((previous) => ({ ...previous, name: value }))}
          />
          <Field
            label="Student number (S number) (required)"
            name="studentNumber"
            required
            value={form.studentNumber}
            onChange={(value) => setForm((previous) => ({ ...previous, studentNumber: value }))}
          />
          <Field
            label="Registration number (required)"
            name="registrationNumber"
            required
            value={form.registrationNumber}
            onChange={(value) => setForm((previous) => ({ ...previous, registrationNumber: value }))}
          />
          <SelectField
            label="Gender (required)"
            name="gender"
            required
            value={form.gender}
            onChange={(value) => setForm((previous) => ({ ...previous, gender: value }))}
            options={[
              { value: '', label: 'Select gender' },
              { value: 'Female', label: 'Female' },
              { value: 'Male', label: 'Male' },
            ]}
          />
          <SelectField
            label="Department (optional)"
            name="department"
            value={form.department}
            onChange={(value) => setForm((previous) => ({ ...previous, department: value }))}
            options={[
              { value: '', label: 'Select department' },
              ...DEPARTMENT_OPTIONS.map((department) => ({
                value: department,
                label: department,
              })),
            ]}
          />
          <Field
            label="Faculty (optional)"
            name="faculty"
            value={form.faculty}
            onChange={(value) => setForm((previous) => ({ ...previous, faculty: value }))}
          />
          <Field
            label="Degree program (optional)"
            name="degreeProgram"
            value={form.degreeProgram}
            onChange={(value) => setForm((previous) => ({ ...previous, degreeProgram: value }))}
          />
          <Field
            label="Email (optional)"
            name="email"
            type="email"
            value={form.email}
            onChange={(value) => setForm((previous) => ({ ...previous, email: value }))}
          />
          <Field
            label="Home contact (required)"
            name="homePhone"
            required
            value={form.homePhone}
            onChange={(value) => setForm((previous) => ({ ...previous, homePhone: value }))}
          />
          <Field
            label="Mobile contact (required)"
            name="mobilePhone"
            required
            value={form.mobilePhone}
            onChange={(value) => setForm((previous) => ({ ...previous, mobilePhone: value }))}
          />
          <Field
            label="Check-in date (required)"
            name="checkIn"
            required
            type="date"
            value={form.checkIn}
            onChange={(value) => setForm((previous) => ({ ...previous, checkIn: value }))}
          />
          <Field
            label="Check-out date (required)"
            name="checkOut"
            required
            type="date"
            value={form.checkOut}
            onChange={(value) => setForm((previous) => ({ ...previous, checkOut: value }))}
          />
          <SelectField
            label="Room number (required)"
            name="roomNumber"
            required
            value={resolvedRoomNumber}
            onChange={(value) => setForm((previous) => ({ ...previous, roomNumber: value }))}
            options={roomOptions.length ? roomOptions : [{ value: '', label: 'No rooms available' }]}
          />
          <SelectField
            label="Bed number (required)"
            name="bedNumber"
            required
            value={resolvedBedNumber}
            onChange={(value) => setForm((previous) => ({ ...previous, bedNumber: value }))}
            options={bedOptions.length ? bedOptions : [{ value: '', label: 'No beds available' }]}
          />
          <TextAreaField
            label="Address (optional)"
            name="address"
            value={form.address}
            onChange={(value) => setForm((previous) => ({ ...previous, address: value }))}
          />
          <TextAreaField
            label="Emergency reason (required)"
            name="specialReason"
            required
            value={form.specialReason}
            onChange={(value) => setForm((previous) => ({ ...previous, specialReason: value }))}
          />
        </div>

        <div className="button-row">
          <button className="primary-button" type="submit">
            Create emergency booking
          </button>
        </div>
      </form>

      <WardenDashboardView
        bookings={pendingApprovals}
        currentUser={currentUser}
        users={users}
        onDecision={onDecision}
        title="Pending Emergency Approvals"
      />

      <section className="panel-card">
        <div className="section-heading">
          <div>
            <div className="eyebrow">{currentUser.roleLabel}</div>
            <h2>Emergency Records</h2>
          </div>
          <div className="section-heading-actions">
            <label className="search-field">
              <span>Search</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search student details, booking id, or room"
                type="search"
                value={query}
              />
            </label>
            {clearableFilteredRecords.length ? (
              <div className="button-row">
                <button
                  className="ghost-button"
                  disabled={isClearingHistory}
                  onClick={handleClearHistory}
                  type="button"
                >
                  {isClearingHistory ? 'Clearing...' : 'Clear history'}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {filteredRecords.length ? (
          <div className="card-list">
            {filteredRecords.map((booking) => {
              const status = getCurrentStatus(booking)
              const paid = isPaymentComplete(booking)

              let action = null

              if (status === 'approved' && !paid) {
                action = (
                  <div className="action-stack">
                    <div className="payment-panel action-panel">
                      <span>Emergency payment required</span>
                      <strong>{formatCurrency(booking.paymentTotal)}</strong>
                      <small>Record payment to activate the QR code for this emergency booking.</small>
                    </div>
                    <div className="button-row">
                      <button className="primary-button" onClick={() => onPay(booking.id)} type="button">
                        Record payment
                      </button>
                    </div>
                  </div>
                )
              }

              if (canWardenClearBookingHistory(booking)) {
                action = (
                  <div className="button-row">
                    <button className="ghost-button" onClick={() => onClear(booking.id)} type="button">
                      Clear row
                    </button>
                  </div>
                )
              }

              return (
                <BookingCard
                  action={action}
                  booking={booking}
                  collapsible
                  currentUser={currentUser}
                  key={booking.id}
                  showQr={status === 'approved' && paid}
                  users={users}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState copy="No emergency permission records are available yet." />
        )}
      </section>
    </div>
  )
}

function AcademicDashboardView({
  approvalBookings,
  currentUser,
  feedbackBookings,
  onDecision,
  onSubmitFeedback,
  users,
}) {
  const [query, setQuery] = useState('')
  const filteredApprovals = filterBookings(approvalBookings, users, query)

  return (
    <div className="stacked-layout">
      <ApprovalQueue
        bookings={filteredApprovals}
        currentUser={currentUser}
        onApprove={(booking) => onDecision(booking.id, 'approved')}
        onReject={(id, reason) => onDecision(id, 'rejected', reason)}
        query={query}
        searchLabel="Search pending requests"
        setQuery={setQuery}
        title="Academic Notifications"
        users={users}
      />
      <SpecialFeedbackQueue
        bookings={feedbackBookings}
        currentUser={currentUser}
        onSubmitFeedback={onSubmitFeedback}
        users={users}
      />
    </div>
  )
}

function WardenDashboardView({ bookings, currentUser, onDecision, title = 'Warden Notifications', users }) {
  const [query, setQuery] = useState('')
  const filtered = filterBookings(bookings, users, query)

  return (
    <WardenApprovalQueue
      bookings={filtered}
      currentUser={currentUser}
      onApprove={(id, specialFeedbackRecipients = []) =>
        onDecision(id, 'approved', '', specialFeedbackRecipients)}
      onReject={(id, reason) => onDecision(id, 'rejected', reason)}
      query={query}
      searchLabel="Search student details"
      setQuery={setQuery}
      title={title}
      users={users}
    />
  )
}

function ApprovalQueue({
  bookings,
  currentUser,
  onApprove,
  onReject,
  query,
  searchLabel,
  setQuery,
  title,
  users,
}) {
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  function openRejectDialog(booking) {
    setRejectTarget(booking)
    setRejectReason('')
  }

  function closeRejectDialog() {
    setRejectTarget(null)
    setRejectReason('')
  }

  function submitRejectReason() {
    const reason = rejectReason.trim()

    if (!rejectTarget || !reason) {
      return
    }

    onReject(rejectTarget.id, reason)
    closeRejectDialog()
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>{title}</h2>
        </div>
        <label className="search-field">
          <span>{searchLabel}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, room, course, or booking id"
            type="search"
            value={query}
          />
        </label>
      </div>

      {bookings.length ? (
        <div className="card-list">
          {bookings.map((booking) => (
            <BookingCard
              action={
                <div className="button-row">
                  <button className="primary-button" onClick={() => onApprove(booking)} type="button">
                    Approve
                  </button>
                  <button className="ghost-button" onClick={() => openRejectDialog(booking)} type="button">
                    Not approve
                  </button>
                </div>
              }
              booking={booking}
              collapsible
              currentUser={currentUser}
              key={booking.id}
              users={users}
            />
          ))}
        </div>
      ) : (
        <EmptyState copy="No matching notifications are waiting right now." />
      )}

      {rejectTarget ? (
        <div className="modal-backdrop" onClick={closeRejectDialog} role="presentation">
          <div
            aria-labelledby={`reject-modal-${rejectTarget.id}`}
            aria-modal="true"
            className="modal-card rejection-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">Not-Approve Reason</div>
                <h3 id={`reject-modal-${rejectTarget.id}`}>Add the reason for {rejectTarget.id}</h3>
              </div>
              <button className="ghost-button" onClick={closeRejectDialog} type="button">
                Close
              </button>
            </div>
            <label className="field full-span">
              <span>Reason for not approving this request</span>
              <textarea
                autoFocus
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Type the reason that should be visible to the student and staff reviewers."
                rows="5"
                value={rejectReason}
              />
            </label>
            <div className="button-row">
              <button
                className="primary-button"
                disabled={!rejectReason.trim()}
                onClick={submitRejectReason}
                type="button"
              >
                Save reason and not approve
              </button>
              <button className="ghost-button" onClick={closeRejectDialog} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SpecialFeedbackQueue({ bookings, currentUser, onSubmitFeedback, users }) {
  const [query, setQuery] = useState('')
  const [feedbackTarget, setFeedbackTarget] = useState(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const filtered = filterBookings(bookings, users, query)

  function openFeedbackDialog(booking) {
    setFeedbackTarget(booking)
    setFeedbackMessage('')
  }

  function closeFeedbackDialog() {
    setFeedbackTarget(null)
    setFeedbackMessage('')
  }

  function submitFeedback() {
    const message = feedbackMessage.trim()

    if (!feedbackTarget || !message) {
      return
    }

    onSubmitFeedback(feedbackTarget.id, message)
    closeFeedbackDialog()
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>Warden Feedback Requests</h2>
        </div>
        <label className="search-field">
          <span>Search feedback requests</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by student, booking id, reason, or feedback"
            type="search"
            value={query}
          />
        </label>
      </div>

      {filtered.length ? (
        <div className="card-list">
          {filtered.map((booking) => (
            <BookingCard
              action={
                <div className="button-row">
                  <button className="primary-button" onClick={() => openFeedbackDialog(booking)} type="button">
                    Send feedback
                  </button>
                </div>
              }
              booking={booking}
              collapsible
              currentUser={currentUser}
              key={booking.id}
              users={users}
            />
          ))}
        </div>
      ) : (
        <EmptyState copy="No warden feedback requests are assigned to you right now." />
      )}

      {feedbackTarget ? (
        <div className="modal-backdrop" onClick={closeFeedbackDialog} role="presentation">
          <div
            aria-labelledby={`special-feedback-modal-${feedbackTarget.id}`}
            aria-modal="true"
            className="modal-card rejection-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">Warden Feedback</div>
                <h3 id={`special-feedback-modal-${feedbackTarget.id}`}>
                  Send feedback for {feedbackTarget.id}
                </h3>
              </div>
              <button className="ghost-button" onClick={closeFeedbackDialog} type="button">
                Close
              </button>
            </div>
            <label className="field full-span">
              <span>Feedback for the warden</span>
              <textarea
                autoFocus
                onChange={(event) => setFeedbackMessage(event.target.value)}
                placeholder="Type the feedback that should be visible to the warden."
                rows="5"
                value={feedbackMessage}
              />
            </label>
            <div className="button-row">
              <button
                className="primary-button"
                disabled={!feedbackMessage.trim()}
                onClick={submitFeedback}
                type="button"
              >
                Send feedback
              </button>
              <button className="ghost-button" onClick={closeFeedbackDialog} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function WardenApprovalQueue({
  bookings,
  currentUser,
  onApprove,
  onReject,
  query,
  searchLabel,
  setQuery,
  title,
  users,
}) {
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveTarget, setApproveTarget] = useState(null)
  const [selectedFeedbackRecipients, setSelectedFeedbackRecipients] = useState([])
  const approveCandidates = approveTarget ? getSpecialFeedbackCandidateUsers(users, approveTarget) : []

  function openRejectDialog(booking) {
    setRejectTarget(booking)
    setRejectReason('')
  }

  function closeRejectDialog() {
    setRejectTarget(null)
    setRejectReason('')
  }

  function submitRejectReason() {
    const reason = rejectReason.trim()

    if (!rejectTarget || !reason) {
      return
    }

    onReject(rejectTarget.id, reason)
    closeRejectDialog()
  }

  function approveBooking(booking) {
    if (!WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)) {
      onApprove(booking.id)
      return
    }

    const candidateUsers = getSpecialFeedbackCandidateUsers(users, booking)
    const defaultRecipients = normalizeSpecialFeedbackRecipients(booking.specialFeedbackRecipients, booking.department)

    setApproveTarget(booking)
    setSelectedFeedbackRecipients(defaultRecipients.length ? defaultRecipients : candidateUsers.slice(0, 1).map((user) => user.username))
  }

  function closeApproveDialog() {
    setApproveTarget(null)
    setSelectedFeedbackRecipients([])
  }

  function submitApproval() {
    if (!approveTarget || !selectedFeedbackRecipients.length) {
      return
    }

    onApprove(approveTarget.id, selectedFeedbackRecipients)
    closeApproveDialog()
  }

  function toggleFeedbackRecipient(username) {
    setSelectedFeedbackRecipients((previous) =>
      previous.includes(username)
        ? previous.filter((value) => value !== username)
        : [...previous, username],
    )
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>{title}</h2>
        </div>
        <label className="search-field">
          <span>{searchLabel}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, room, course, or booking id"
            type="search"
            value={query}
          />
        </label>
      </div>

      {bookings.length ? (
        <div className="card-list">
          {bookings.map((booking) => (
            <BookingCard
              action={
                <div className="button-row">
                  <button className="primary-button" onClick={() => approveBooking(booking)} type="button">
                    Approve
                  </button>
                  <button className="ghost-button" onClick={() => openRejectDialog(booking)} type="button">
                    Not approve
                  </button>
                </div>
              }
              booking={booking}
              collapsible
              currentUser={currentUser}
              key={booking.id}
              users={users}
            />
          ))}
        </div>
      ) : (
        <EmptyState copy="No matching notifications are waiting right now." />
      )}

      {approveTarget ? (
        <div className="modal-backdrop" onClick={closeApproveDialog} role="presentation">
          <div
            aria-labelledby={`approve-modal-${approveTarget.id}`}
            aria-modal="true"
            className="modal-card rejection-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">Warden Approval</div>
                <h3 id={`approve-modal-${approveTarget.id}`}>
                  Select academic feedback contacts for {approveTarget.id}
                </h3>
              </div>
              <button className="ghost-button" onClick={closeApproveDialog} type="button">
                Close
              </button>
            </div>
            <label className="field full-span">
              <span>Academic staff members who should send feedback to the warden</span>
              <div className="selection-list">
                {approveCandidates.length ? (
                  approveCandidates.map((person) => (
                    <label
                      className={`selection-item ${
                        selectedFeedbackRecipients.includes(person.username) ? 'selected' : ''
                      }`}
                      key={person.username}
                    >
                      <input
                        checked={selectedFeedbackRecipients.includes(person.username)}
                        onChange={() => toggleFeedbackRecipient(person.username)}
                        type="checkbox"
                      />
                      <span>{`${person.roleLabel} - ${person.name}${person.department ? ` (${person.department})` : ''}`}</span>
                    </label>
                  ))
                ) : (
                  <span>No academic staff are available for this booking yet.</span>
                )}
              </div>
            </label>
            <div className="button-row">
              <button
                className="primary-button"
                disabled={!selectedFeedbackRecipients.length}
                onClick={submitApproval}
                type="button"
              >
                Approve and send
              </button>
              <button className="ghost-button" onClick={closeApproveDialog} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectTarget ? (
        <div className="modal-backdrop" onClick={closeRejectDialog} role="presentation">
          <div
            aria-labelledby={`reject-modal-${rejectTarget.id}`}
            aria-modal="true"
            className="modal-card rejection-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">Not-Approve Reason</div>
                <h3 id={`reject-modal-${rejectTarget.id}`}>Add the reason for {rejectTarget.id}</h3>
              </div>
              <button className="ghost-button" onClick={closeRejectDialog} type="button">
                Close
              </button>
            </div>
            <label className="field full-span">
              <span>Reason for not approving this request</span>
              <textarea
                autoFocus
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Type the reason that should be visible to the student and staff reviewers."
                rows="5"
                value={rejectReason}
              />
            </label>
            <div className="button-row">
              <button
                className="primary-button"
                disabled={!rejectReason.trim()}
                onClick={submitRejectReason}
                type="button"
              >
                Save reason and not approve
              </button>
              <button className="ghost-button" onClick={closeRejectDialog} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DecisionListView({
  bookings,
  currentUser,
  emptyCopy,
  onClear = null,
  onClearHistory = null,
  showQr = false,
  title,
  users,
}) {
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const [query, setQuery] = useState('')
  const visibleBookings = bookings.filter((booking) => !isHistoryClearedForUser(booking, currentUser))
  const filtered = filterBookings(visibleBookings, users, query)

  async function handleClearHistory() {
    if (!onClearHistory || !filtered.length) {
      return
    }

    const shouldClear = window.confirm(
      'Clear all currently visible history rows from this page?',
    )

    if (!shouldClear) {
      return
    }

    setIsClearingHistory(true)

    try {
      await onClearHistory(filtered.map((booking) => booking.id))
    } finally {
      setIsClearingHistory(false)
    }
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>{title}</h2>
        </div>
        <div className="section-heading-actions">
          <label className="search-field">
            <span>Search</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student details, booking id, or room"
              type="search"
              value={query}
            />
          </label>
          {onClearHistory && filtered.length ? (
            <div className="button-row">
              <button
                className="ghost-button"
                disabled={isClearingHistory}
                onClick={handleClearHistory}
                type="button"
              >
                {isClearingHistory ? 'Clearing...' : 'Clear history'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {filtered.length ? (
        <div className="card-list">
          {filtered.map((booking) => (
            <BookingCard
              action={
                onClear ? (
                  <div className="button-row">
                    <button className="ghost-button" onClick={() => onClear(booking.id)} type="button">
                      Clear row
                    </button>
                  </div>
                ) : null
              }
              booking={booking}
              collapsible
              currentUser={currentUser}
              key={booking.id}
              showQr={showQr}
              users={users}
            />
          ))}
        </div>
      ) : (
        <EmptyState copy={emptyCopy} />
      )}
    </section>
  )
}

function BookingCard({ action = null, booking, collapsible = false, currentUser = null, showQr = false, users }) {
  const student = users.find((user) => user.username === booking.studentUsername)
  const academicReviewer = users.find((user) => user.username === booking.academicReviewedBy)
  const wardenReviewer = users.find((user) => user.username === booking.wardenReviewedBy)
  const academicApproverUsers = getAcademicApproverUsers(users, booking)
  const academicApprovedUsers = getAcademicApprovedReviewerUsers(users, booking)
  const academicPendingUsers = getAcademicPendingReviewerUsers(users, booking)
  const academicRejectedUsers = getAcademicRejectedReviewerUsers(users, booking)
  const specialFeedbackRequestedBy = users.find(
    (user) => user.username === booking.specialFeedbackRequestedBy,
  )
  const specialFeedbackContactUsers = getSpecialFeedbackContactUsers(users, booking)
  const specialFeedbackEntries = getSpecialFeedbackEntries(booking)
  const pendingSpecialFeedbackUsers = getPendingSpecialFeedbackUsers(users, booking)
  const wardenApproverUsers = getWardenApproverUsers(users, booking)
  const [isExpanded, setIsExpanded] = useState(!collapsible)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)

  const paymentStatusLabel = booking.paymentStatus ?? 'unpaid'
  const canShowQr = showQr && isPaymentComplete(booking)
  const status = getCurrentStatus(booking)
  const isWardenOnlyBooking = WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)
  const canViewSpecialFeedback = canViewerSeeSpecialFeedback(currentUser, booking)
  const rejectionReason = getRejectionReason(booking)
  const viewerAcademicDecision = getAcademicDecisionForUser(booking, currentUser)
  const academicReviewLabel = isWardenOnlyBooking
    ? 'Not required'
    : booking.academicStatus === 'approved'
      ? academicApprovedUsers.length
        ? `${formatPersonLabelList(academicApprovedUsers)} approved`
        : academicReviewer
          ? `${academicReviewer.roleLabel} - ${academicReviewer.name}`
          : 'Approved'
      : booking.academicStatus === 'rejected'
        ? academicRejectedUsers.length
          ? `${formatPersonLabelList(academicRejectedUsers)} did not approve`
          : academicReviewer
            ? `${academicReviewer.roleLabel} - ${academicReviewer.name}`
            : 'Rejected'
        : academicPendingUsers.length
          ? `Pending from ${formatPersonLabelList(academicPendingUsers)}`
          : 'Pending'
  const specialFeedbackDetails =
    canViewSpecialFeedback &&
    isWardenOnlyBooking &&
    (booking.wardenStatus === 'approved' || booking.specialFeedbackRequestedAt || specialFeedbackEntries.length)
      ? [
          [
            'Selected academic contacts',
            specialFeedbackContactUsers.length
              ? formatApproverList(specialFeedbackContactUsers)
              : 'Not selected yet',
          ],
          [
            'Feedback requested by',
            specialFeedbackRequestedBy
              ? `${specialFeedbackRequestedBy.roleLabel} - ${specialFeedbackRequestedBy.name}`
              : 'Pending',
          ],
          [
            'Feedback request date',
            booking.specialFeedbackRequestedAt ? formatDate(booking.specialFeedbackRequestedAt) : 'Pending',
          ],
          [
            'Feedback responses',
            specialFeedbackEntries.length
              ? (
                <DetailValueList
                  values={specialFeedbackEntries.map((entry) => formatSpecialFeedbackEntry(entry, users))}
                />
              )
              : 'Pending',
          ],
          [
            'Pending feedback from',
            pendingSpecialFeedbackUsers.length
              ? <DetailValueList values={pendingSpecialFeedbackUsers.map((person) => `${person.roleLabel} - ${person.name}`)} />
              : 'All selected staff submitted feedback',
          ],
        ]
      : []
  const summaryLabel =
    currentUser?.roleGroup === 'academic' && viewerAcademicDecision === 'approved' && status === 'pending academic'
      ? 'You approved this request'
      : currentUser?.roleGroup === 'academic' && viewerAcademicDecision === 'rejected'
        ? 'You marked this request as not approved'
      : status === 'not approved'
      ? 'Request not approved'
      : status === 'approved' && !isPaymentComplete(booking)
      ? `Payment ${formatCurrency(booking.paymentTotal)} pending`
      : status === 'approved' && isPaymentComplete(booking)
        ? 'Paid and QR ready'
        : 'Submitted and waiting for review'
  const bookingTypeLabel =
    booking.workflow === 'special'
      ? 'Special reason booking'
      : booking.workflow === 'emergency'
        ? 'Emergency permission booking'
        : 'Academic TRF booking'
  const bookingSummaryDetails =
    isWardenOnlyBooking && booking.specialReason
      ? `${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)} | Room ${booking.roomNumber}, Bed ${booking.bedNumber} | ${booking.specialReason}`
      : `${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)} | Room ${booking.roomNumber}, Bed ${booking.bedNumber}`

  return (
    <article className="booking-card">
      {collapsible ? (
        <button
          aria-expanded={isExpanded}
          className="booking-summary-button"
          onClick={() => setIsExpanded((previous) => !previous)}
          type="button"
        >
          <div className="booking-summary-main">
            <div>
              <div className="booking-id">{booking.id}</div>
              <h3>{student?.name ?? booking.studentUsername}</h3>
              <p>{bookingSummaryDetails}</p>
            </div>
            <div className="booking-summary-meta">
              <span>{summaryLabel}</span>
              <small>{isExpanded ? 'Hide details' : 'View details'}</small>
            </div>
          </div>
          <div className="booking-summary-side">
            <StatusPill status={status} />
            <span className="booking-toggle-indicator">{isExpanded ? '−' : '+'}</span>
          </div>
        </button>
      ) : (
        <div className="booking-header">
          <div>
            <div className="booking-id">{booking.id}</div>
            <h3>{student?.name ?? booking.studentUsername}</h3>
            <p>
              {bookingTypeLabel} for room {booking.roomNumber}, bed {booking.bedNumber}
            </p>
          </div>
          <StatusPill status={status} />
        </div>
      )}

      {isExpanded ? (
        <>
          <div className="booking-grid">
            <DetailGrid
              items={[
                ['Student', student?.name ?? booking.studentUsername],
                ['Registration number', student?.registrationNumber ?? 'N/A'],
                ['Booking dates', `${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)}`],
                ['Requested days', `${booking.requestedDays}`],
                ['Payment', formatCurrency(booking.paymentTotal)],
                ['Payment status', paymentStatusLabel],
                ['Booking date', formatDate(booking.checkIn)],
              ]}
            />

            <DetailGrid
              items={[
                ['Room number', `${booking.roomNumber}`],
                ['Bed number', `${booking.bedNumber}`],
                ['Department', booking.department || 'No'],
                ['Subject course code', booking.courseCode || 'No'],
                ['Academic activity', booking.academicActivity || 'No'],
                [
                  booking.workflow === 'emergency' ? 'Emergency reason' : 'Special reason',
                  booking.specialReason || 'No',
                ],
              ]}
            />

            <DetailGrid
              items={[
                ['Home contact', booking.homePhone || student?.homePhone || 'N/A'],
                ['Mobile contact', booking.mobilePhone || student?.mobilePhone || 'N/A'],
                [
                  'Academic approver team',
                  isWardenOnlyBooking ? 'Not required' : formatApproverList(academicApproverUsers),
                ],
                [
                  'Academic staff review',
                  academicReviewLabel,
                ],
                [
                  'Academic review date',
                  booking.academicReviewedAt ? formatDate(booking.academicReviewedAt) : 'Pending',
                ],
                ['Warden approver team', formatApproverList(wardenApproverUsers)],
                [
                  'Warden team review',
                  wardenReviewer
                    ? `${wardenReviewer.roleLabel} - ${wardenReviewer.name}`
                    : booking.wardenStatus === 'pending'
                      ? 'Pending'
                      : booking.wardenStatus,
                ],
                [
                  'Warden review date',
                  booking.wardenReviewedAt ? formatDate(booking.wardenReviewedAt) : 'Pending',
                ],
                ...specialFeedbackDetails,
                ...(rejectionReason ? [['Not-approved reason', rejectionReason]] : []),
                ['Payment completed on', booking.paymentPaidAt ? formatDate(booking.paymentPaidAt) : 'Pending'],
                [
                  'Staff details',
                  <button
                    className="detail-action-button"
                    onClick={() => setIsStaffModalOpen(true)}
                    type="button"
                  >
                    View popup
                  </button>,
                ],
              ]}
            />
          </div>

          {(canShowQr || action) && (
            <div className="booking-footer">
              {canShowQr ? <QrPreview bookingId={booking.id} value={booking.qrValue} /> : <span />}
              {action}
            </div>
          )}

          {isStaffModalOpen ? (
            <div className="modal-backdrop" onClick={() => setIsStaffModalOpen(false)} role="presentation">
              <div
                aria-labelledby={`staff-modal-${booking.id}`}
                aria-modal="true"
                className="modal-card"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="modal-header">
                  <div>
                    <div className="eyebrow">Staff details</div>
                    <h3 id={`staff-modal-${booking.id}`}>Approval contacts for {booking.id}</h3>
                  </div>
                  <button className="ghost-button" onClick={() => setIsStaffModalOpen(false)} type="button">
                    Close
                  </button>
                </div>
                <div className="modal-grid">
                  <StaffContactGroup
                    emptyCopy={
                      isWardenOnlyBooking
                        ? 'No academic feedback contact has been selected yet.'
                        : 'No academic approvers assigned.'
                    }
                    people={isWardenOnlyBooking ? specialFeedbackContactUsers : academicApproverUsers}
                    title={isWardenOnlyBooking ? 'Academic feedback contact' : 'Academic approver details'}
                  />
                  <StaffContactGroup
                    emptyCopy="No warden approvers assigned."
                    people={wardenApproverUsers}
                    title="Warden approver details"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

function ScanConfirmationsView({
  bookings,
  currentUser,
  iotLogUrl,
  onClearConfirmations,
  onSyncIotAccess,
  onSyncIotLog,
  onUpdateIotLogUrl,
  scanLogs,
  users,
}) {
  const [query, setQuery] = useState('')
  const [draftUrl, setDraftUrl] = useState(iotLogUrl)
  const deviceName = 'ESP32-CAM QR Scanner'

  useEffect(() => {
    setDraftUrl(iotLogUrl)
  }, [iotLogUrl])

  useEffect(() => {
    if (!iotLogUrl.trim()) {
      return undefined
    }

    const syncNow = () => {
      onSyncIotLog({ deviceName, silent: true })
    }

    syncNow()
    const intervalId = window.setInterval(syncNow, 8000)
    return () => window.clearInterval(intervalId)
  }, [deviceName, iotLogUrl, onSyncIotLog])

  const normalizedQuery = query.trim().toLowerCase()
  const records = scanLogs
    .map((log) => {
      const booking = bookings.find((entry) => entry.id === log.bookingId || entry.qrValue === log.qrValue)
      const student = users.find((user) => user.username === (log.studentUsername || booking?.studentUsername))

      return {
        ...log,
        booking,
        student,
      }
    })
    .filter(
      (record) =>
        (record.booking && canWardenUserReviewBooking(currentUser, record.booking)) ||
        (!record.booking && currentUser.roleLabel === 'Warden'),
    )
    .filter((record) => {
      if (!normalizedQuery) {
        return true
      }

      return [
        record.qrCodeName,
        record.qrValue,
        record.result,
        record.role,
        record.message,
        record.booking?.id,
        record.student?.name,
        record.student?.registrationNumber,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    })
    .sort((left, right) => new Date(right.scannedAt) - new Date(left.scannedAt))

  async function handleConnect(event) {
    event.preventDefault()
    onUpdateIotLogUrl(draftUrl)
    await onSyncIotAccess({ targetUrl: draftUrl, silent: true })
    await onSyncIotLog({ deviceName, targetUrl: draftUrl })
  }

  function handleDisconnect() {
    setDraftUrl('')
    onUpdateIotLogUrl('')
  }

  async function handleClearConfirmations() {
    if (!onClearConfirmations) {
      return
    }

    const shouldClear = window.confirm(
      'Clear all QR confirmation rows from the website and try to clear the ESP32 scan log too?',
    )

    if (!shouldClear) {
      return
    }

    await onClearConfirmations()
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>QR Scan Confirmations</h2>
        </div>
        <label className="search-field">
          <span>Search confirmations</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by QR, student, booking id, or result"
            type="search"
            value={query}
          />
        </label>
      </div>

      <p className="scan-auto-note">
        Confirmation rows and matched student details appear automatically when scanner data is available.
      </p>

      <p className="scan-auto-note">
        Approved and paid student QR codes can also be synced to the ESP32 access list so the scanner opens only for active hostel bookings.
      </p>

      <form className="iot-connect-panel" onSubmit={handleConnect}>
        <label className="field full-span">
          <span>ESP32 scanner log URL</span>
          <input
            onChange={(event) => setDraftUrl(event.target.value)}
            placeholder="http://192.168.1.50/view-log"
            type="url"
            value={draftUrl}
          />
        </label>
        <div className="button-row">
          <button className="primary-button" type="submit">
            Save and sync
          </button>
          <button
            className="ghost-button"
            onClick={() => onSyncIotLog({ deviceName })}
            type="button"
          >
            Sync now
          </button>
          <button
            className="ghost-button"
            onClick={() => onSyncIotAccess({})}
            type="button"
          >
            Sync approved QR access
          </button>
          <button
            className="ghost-button"
            onClick={handleClearConfirmations}
            type="button"
          >
            Clear confirmations
          </button>
          <button className="ghost-button" onClick={handleDisconnect} type="button">
            Clear URL
          </button>
        </div>
      </form>

      {records.length ? (
        <div className="card-list">
          {records.map((record) => (
            <ScanConfirmationCard key={record.id} record={record} />
          ))}
        </div>
      ) : (
        <EmptyState copy="No QR scan confirmations are available yet." />
      )}
    </section>
  )
}

function ScanConfirmationCard({ record }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <article className="booking-card">
      <button
        aria-expanded={isExpanded}
        className="booking-summary-button"
        onClick={() => setIsExpanded((previous) => !previous)}
        type="button"
      >
        <div className="booking-summary-main">
          <div>
            <div className="booking-id">{record.qrCodeName || record.booking?.id || 'Unknown QR'}</div>
            <h3>{record.student?.name ?? 'Unknown student'}</h3>
            <p>
              {formatDate(record.scannedAt)} at {formatTime(record.scannedAt)} | {record.deviceName}
            </p>
          </div>
          <div className="booking-summary-meta">
            <span>{record.message}</span>
            <small>{isExpanded ? 'Hide details' : 'View details'}</small>
          </div>
        </div>
        <div className="booking-summary-side">
          <StatusPill status={record.result} />
          <span className="booking-toggle-indicator">{isExpanded ? '-' : '+'}</span>
        </div>
      </button>

      {isExpanded ? (
        <>
          <div className="booking-grid">
            <DetailGrid
              items={[
                ['Scanned date', formatDate(record.scannedAt)],
                ['Scanned time', formatTime(record.scannedAt)],
                ['QR code name', record.qrCodeName || record.booking?.id || 'Unknown'],
                ['QR code value', record.qrValue],
              ]}
            />
            <DetailGrid
              items={[
                ['Confirmation result', record.result],
                ['Role', record.role || 'unknown'],
                ['Booking id', record.booking?.id ?? 'Not matched'],
                ['Student', record.student?.name ?? 'Unknown'],
              ]}
            />
            <DetailGrid
              items={[
                ['Registration number', record.student?.registrationNumber ?? 'N/A'],
                [
                  'Assigned bed',
                  record.booking ? `Room ${record.booking.roomNumber}, Bed ${record.booking.bedNumber}` : 'N/A',
                ],
                ['Scanner device', record.deviceName],
                ['Message', record.message],
              ]}
            />
          </div>
        </>
      ) : null}
    </article>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CredentialGroup({ description, title, users, onUse }) {
  return (
    <article className="panel-card credential-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="credential-list">
        {users.map((user) => (
          <button className="credential-button" key={user.username} onClick={() => onUse(user)} type="button">
            <strong>{getUserCredentialTitle(user)}</strong>
            <span>{user.name}</span>
            <span>{user.username}</span>
            <small>{user.password}</small>
          </button>
        ))}
      </div>
    </article>
  )
}

function ContactCard({ email, label, name, phone }) {
  return (
    <div className="contact-card">
      <span>{label}</span>
      <strong>{name}</strong>
      <p>{phone}</p>
      <small>{email}</small>
    </div>
  )
}

function StaffContactGroup({ emptyCopy, people, title }) {
  return (
    <section className="staff-contact-group">
      <h4>{title}</h4>
      {people.length ? (
        <div className="staff-contact-list">
          {people.map((person) => (
            <StaffContactItem key={person.username} person={person} />
          ))}
        </div>
      ) : (
        <p className="staff-contact-empty">{emptyCopy}</p>
      )}
    </section>
  )
}

function StaffContactItem({ person }) {
  const roleLine = getStaffRoleLine(person)
  const emailLine = person.email ?? 'N/A'
  const phoneLine = formatPhoneWithCountryCode(person.mobilePhone)

  return (
    <article className="staff-contact-item">
      <strong>{person.name}</strong>
      <span>{`(${roleLine})`}</span>
      <span>{`(${emailLine})`}</span>
      <span>{`(${phoneLine})`}</span>
    </article>
  )
}

function DetailValueList({ values }) {
  return (
    <div className="detail-value-list">
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  )
}

function DetailGrid({ items }) {
  return (
    <dl className="detail-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function EmptyState({ copy }) {
  return <div className="empty-state">{copy}</div>
}

function StatusPill({ status }) {
  const className = `status-pill ${status.replaceAll(' ', '-')}`

  return <span className={className}>{status}</span>
}

function Field({ label, name, onChange, required = false, type = 'text', value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  )
}

function SelectField({ label, name, onChange, options, required = false, value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} onChange={(event) => onChange(event.target.value)} required={required} value={value}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextAreaField({ label, name, onChange, required = false, value }) {
  return (
    <label className="field full-span">
      <span>{label}</span>
      <textarea
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        rows="5"
        value={value}
      />
    </label>
  )
}

function QrPreview({ bookingId = 'booking', value }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let mounted = true

    QRCode.toDataURL(value, {
      margin: 4,
      width: 240,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    }).then((result) => {
      if (mounted) {
        setSrc(result)
      }
    })

    return () => {
      mounted = false
    }
  }, [value])

  return (
    <div className="qr-preview">
      {src ? <img alt={`QR code for ${value}`} src={src} /> : null}
      <span>{value}</span>
      {src ? (
        <a className="ghost-button" download={`qr-${bookingId}.png`} href={src}>
          Download QR
        </a>
      ) : null}
    </div>
  )
}

function getNavItems(roleGroup) {
  if (roleGroup === 'student') {
    return [
      { id: 'home', label: 'Home' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'booking', label: 'TRF Booking' },
      { id: 'bookings', label: 'My Bookings' },
    ]
  }

  if (roleGroup === 'academic') {
    return [
      { id: 'home', label: 'Home' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'approved', label: 'Approved Requests' },
      { id: 'rejected', label: 'Not-Approved Requests' },
    ]
  }

  return [
    { id: 'home', label: 'Home' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'confirmations', label: 'QR Confirmations' },
    { id: 'special', label: 'Special Notifications' },
    { id: 'details', label: 'TRF Student Details' },
    { id: 'rejected', label: 'Not-Approved Requests' },
    { id: 'emergency', label: 'Emergency Permission' },
  ]
}

function getDefaultView() {
  return 'home'
}

function getPrimaryAcademicApprover(users, department) {
  return (
    getDepartmentHod(users, department) ??
    getDepartmentAcademicCoordinator(users, department) ??
    null
  )
}

function canAcademicUserAccessRegularBooking(user, booking) {
  if (user.roleGroup !== 'academic' || booking.workflow !== 'regular') {
    return false
  }

  const reviewTeamUsernames = getBookingAcademicTeamUsernames(booking)

  if (reviewTeamUsernames.length) {
    return reviewTeamUsernames.includes(user.username)
  }

  return (
    user.username === normalizeAcademicUsername(booking.academicApproverUsername, booking.department) ||
    isDepartmentAcademicCoordinator(user, booking.department)
  )
}

function canAcademicUserReviewBooking(user, booking) {
  if (!canAcademicUserAccessRegularBooking(user, booking)) {
    return false
  }

  const pendingReviewerUsernames = getPendingAcademicReviewerUsernames(booking)

  if (pendingReviewerUsernames.length || booking.academicStatus !== 'pending') {
    return pendingReviewerUsernames.includes(user.username)
  }

  return (
    user.username === normalizeAcademicUsername(booking.academicApproverUsername, booking.department) ||
    isDepartmentAcademicCoordinator(user, booking.department)
  )
}

function canAcademicUserProvideSpecialFeedback(user, booking) {
  return (
    user.roleGroup === 'academic' &&
    WARDEN_ONLY_WORKFLOWS.includes(booking.workflow) &&
    booking.wardenStatus === 'approved' &&
    normalizeSpecialFeedbackRecipients(booking.specialFeedbackRecipients, booking.department).includes(user.username) &&
    !hasSpecialFeedbackFromUser(booking, user.username)
  )
}

function canViewerSeeSpecialFeedback(currentUser, booking) {
  if (!currentUser || !WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)) {
    return false
  }

  return (
    currentUser.roleGroup === 'warden' ||
    normalizeSpecialFeedbackRecipients(booking.specialFeedbackRecipients, booking.department).includes(currentUser.username)
  )
}

function isStudentCounselor(user) {
  return user?.roleGroup === 'academic' && user.roleLabel === 'Student counselor'
}

function getUserCredentialTitle(user) {
  return user.department && user.roleGroup === 'academic'
    ? `${user.roleLabel} - ${user.department}`
    : user.roleLabel
}

function getAcademicApproverUsers(users, booking) {
  if (WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)) {
    return []
  }

  const teamUsernames = getBookingAcademicTeamUsernames(booking)
  const matchingUsers = users.filter((user) => teamUsernames.includes(user.username))
  return matchingUsers.length ? matchingUsers : getRegularAcademicReviewUsers(users, booking)
}

function getAcademicPendingReviewerUsers(users, booking) {
  return users.filter((user) => getPendingAcademicReviewerUsernames(booking).includes(user.username))
}

function getAcademicApprovedReviewerUsers(users, booking) {
  return users.filter((user) => (booking.academicApprovedReviewerUsernames ?? []).includes(user.username))
}

function getAcademicRejectedReviewerUsers(users, booking) {
  return users.filter((user) => (booking.academicRejectedReviewerUsernames ?? []).includes(user.username))
}

function getRegularAcademicReviewUsers(users, booking) {
  if (WARDEN_ONLY_WORKFLOWS.includes(booking.workflow) || booking.workflow !== 'regular') {
    return []
  }

  const hod = getDepartmentHod(users, booking.department)
  const coordinator = getDepartmentAcademicCoordinator(users, booking.department)
  const reviewTeam = [hod, coordinator]
    .filter(Boolean)
    .filter((user, index, collection) => collection.findIndex((entry) => entry.username === user.username) === index)

  if (reviewTeam.length) {
    return reviewTeam
  }

  return users.filter(
    (user) =>
      user.roleGroup === 'academic' &&
      user.department === booking.department &&
      (user.roleLabel === 'Head of Department (HOD)' || user.roleLabel === 'Academic coordinator'),
  )
}

function getDepartmentHod(users, department) {
  return users.find(
    (user) =>
      user.roleGroup === 'academic' &&
      user.roleLabel === 'Head of Department (HOD)' &&
      user.department === department,
  ) ?? null
}

function getDepartmentAcademicCoordinator(users, department) {
  return users.find(
    (user) =>
      user.roleGroup === 'academic' &&
      user.roleLabel === 'Academic coordinator' &&
      user.department === department,
  ) ?? null
}

function isDepartmentAcademicCoordinator(user, department) {
  return (
    user?.roleGroup === 'academic' &&
    user.roleLabel === 'Academic coordinator' &&
    user.department === department
  )
}

function getBookingAcademicTeamUsernames(booking) {
  return booking.academicReviewTeamUsernames ?? []
}

function getPendingAcademicReviewerUsernames(booking) {
  if (Array.isArray(booking.academicPendingReviewerUsernames)) {
    return booking.academicPendingReviewerUsernames
  }

  if (booking.academicStatus !== 'pending') {
    return []
  }

  return getBookingAcademicTeamUsernames(booking)
}

function getAcademicDecisionForUser(booking, user) {
  if (!user || user.roleGroup !== 'academic' || booking.workflow !== 'regular') {
    return ''
  }

  const reviewEntries = Array.isArray(booking.academicReviewEntries) ? booking.academicReviewEntries : []
  const latestEntry = [...reviewEntries]
    .filter((entry) => entry.actorUsername === user.username)
    .sort((left, right) => new Date(left.actionAt || 0) - new Date(right.actionAt || 0))
    .at(-1)

  if (latestEntry?.action === 'approved' || latestEntry?.action === 'rejected') {
    return latestEntry.action
  }

  if (booking.academicReviewedBy === user.username) {
    if (booking.academicStatus === 'approved' || booking.academicStatus === 'rejected') {
      return booking.academicStatus
    }
  }

  return ''
}

function getSpecialFeedbackCandidateUsers(users, booking) {
  const relevantUsers = users.filter((user) => user.roleGroup === 'academic').filter((user) => {
    if (!booking.department) {
      return true
    }

    return user.department === booking.department || isStudentCounselor(user)
  })

  const rolePriority = {
    'Head of Department (HOD)': 0,
    'Academic coordinator': 1,
    'Student counselor': 2,
  }

  return [...relevantUsers].sort((left, right) => {
    const priorityDifference = (rolePriority[left.roleLabel] ?? 99) - (rolePriority[right.roleLabel] ?? 99)

    if (priorityDifference !== 0) {
      return priorityDifference
    }

    return left.name.localeCompare(right.name)
  })
}

function getSpecialFeedbackContactUsers(users, booking) {
  const recipientUsernames = normalizeSpecialFeedbackRecipients(booking.specialFeedbackRecipients, booking.department)
  return users.filter((user) => recipientUsernames.includes(user.username))
}

function getSpecialFeedbackEntries(booking) {
  return normalizeSpecialFeedbackEntries(booking.specialFeedbackEntries, booking.department)
}

function getPendingSpecialFeedbackUsers(users, booking) {
  const submittedUsernames = new Set(getSpecialFeedbackEntries(booking).map((entry) => entry.actorUsername))
  return getSpecialFeedbackContactUsers(users, booking).filter((user) => !submittedUsernames.has(user.username))
}

function hasSpecialFeedbackFromUser(booking, username) {
  return getSpecialFeedbackEntries(booking).some((entry) => entry.actorUsername === username)
}

function upsertSpecialFeedbackEntry(entries, nextEntry) {
  const normalizedEntries = normalizeSpecialFeedbackEntries(entries)
  const remainingEntries = normalizedEntries.filter((entry) => entry.actorUsername !== nextEntry.actorUsername)
  return [...remainingEntries, nextEntry].sort((left, right) => new Date(left.providedAt) - new Date(right.providedAt))
}

function formatSpecialFeedbackEntry(entry, users) {
  const person = users.find((user) => user.username === entry.actorUsername)
  const actorLabel = person ? `${person.roleLabel} - ${person.name}` : entry.actorUsername
  const dateLabel = entry.providedAt ? formatDate(entry.providedAt) : 'Pending date'
  return `${actorLabel} (${dateLabel}): ${entry.message}`
}

function getWardenApproverUsers(users, booking) {
  const assignedSubWarden = users.find(
    (user) => user.roleGroup === 'warden' && canWardenUserReviewBooking(user, booking) && user.roleLabel !== 'Warden',
  )

  return users.filter(
    (user) =>
      user.roleGroup === 'warden' &&
      (user.roleLabel === 'Warden' || user.username === assignedSubWarden?.username),
  )
}

function formatApproverList(people) {
  return people.length
    ? <DetailValueList values={people.map((person) => `${person.roleLabel} - ${person.name}`)} />
    : 'N/A'
}

function isHistoryClearedForUser(booking, currentUser) {
  if (currentUser.roleGroup === 'academic') {
    return (booking.academicClearedBy ?? []).includes(currentUser.username)
  }

  if (currentUser.roleGroup === 'warden') {
    return (booking.wardenClearedBy ?? []).includes(currentUser.username)
  }

  return false
}

function canStudentClearBookingHistory(booking) {
  const status = getCurrentStatus(booking)
  return (status === 'approved' && isPaymentComplete(booking)) || status === 'cancelled' || status === 'not approved'
}

function canWardenClearBookingHistory(booking) {
  const status = getCurrentStatus(booking)
  return (status === 'approved' && isPaymentComplete(booking)) || status === 'cancelled' || status === 'not approved'
}

function canWardenUserReviewBooking(user, booking) {
  if (user.roleGroup !== 'warden') {
    return false
  }

  return getVisibleRoomNumbersForWarden(user).includes(booking.roomNumber)
}

function getVisibleRoomNumbersForWarden(user) {
  if (user.roleLabel === 'Sub warden (Female)') {
    return getRoomNumbersForGender('Female')
  }

  if (user.roleLabel === 'Sub warden (Male)') {
    return getRoomNumbersForGender('Male')
  }

  return getRoomNumbersForGender('')
}

function getStaffRoleLine(person) {
  if (!person) {
    return 'Staff member'
  }

  if (person.roleGroup === 'academic') {
    if (person.roleLabel === 'Head of Department (HOD)' && person.department) {
      return `HOD in ${person.department} department`
    }

    if (person.roleLabel === 'Academic coordinator' && person.department) {
      return `Academic coordinator in ${person.department} department`
    }

    if (person.roleLabel === 'Student counselor') {
      return 'Student counselor'
    }
  }

  if (person.roleGroup === 'warden') {
    if (person.roleLabel === 'Warden') {
      return 'Warden'
    }

    if (person.roleLabel) {
      return person.roleLabel
    }
  }

  return person.roleLabel ?? 'Staff member'
}

function formatPhoneWithCountryCode(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')

  if (!digits) {
    return 'N/A'
  }

  if (digits.startsWith('94') && digits.length >= 11) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `+94 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  }

  return phone
}

function getPageHeading(roleGroup, activeView) {
  const map = {
    student: {
      home: 'Student Home',
      dashboard: 'Student Dashboard',
      booking: 'TRF Booking',
      bookings: 'My Bookings',
    },
    academic: {
      home: 'Academic Staff Home',
      dashboard: 'Dashboard',
      approved: 'Approved Requests',
      rejected: 'Not-Approved Requests',
    },
    warden: {
      home: 'Warden Home',
      dashboard: 'Dashboard',
      confirmations: 'QR Confirmations',
      special: 'Special Reason Notifications',
      details: 'TRF Student Details',
      rejected: 'Not-Approved Requests',
      emergency: 'Emergency Permission',
    },
  }

  return map[roleGroup][activeView] ?? 'Portal'
}

function getRemainingDays(student, allBookings) {
  const currentYear = new Date().getFullYear()
  const used = allBookings
    .filter((booking) => booking.studentUsername === student.username)
    .filter((booking) => getBookingYear(booking) === currentYear)
    .filter(shouldCountAgainstDays)
    .reduce((total, booking) => total + booking.requestedDays, 0)

  return Math.max(0, YEAR_STAY_LIMIT - used)
}

function createInitialBookingForm(student) {
  const now = new Date()
  const tomorrow = new Date(now)
  const dayAfter = new Date(now)
  const defaultRoomNumber = String(getRoomNumbersForGender(student.gender)[0] ?? 1)
  tomorrow.setDate(tomorrow.getDate() + 1)
  dayAfter.setDate(dayAfter.getDate() + 2)

  return {
    workflow: 'regular',
    checkIn: toIsoDate(tomorrow),
    checkOut: toIsoDate(dayAfter),
    roomNumber: defaultRoomNumber,
    bedNumber: '1',
    department: '',
    courseCode: '',
    academicActivity: '',
    specialReason: '',
    homePhone: student.homePhone,
    mobilePhone: student.mobilePhone,
  }
}

function createInitialEmergencyForm() {
  const now = new Date()
  const tomorrow = new Date(now)
  const dayAfter = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  dayAfter.setDate(dayAfter.getDate() + 2)

  return {
    name: '',
    studentNumber: '',
    registrationNumber: '',
    gender: '',
    department: '',
    faculty: '',
    degreeProgram: '',
    email: '',
    address: '',
    homePhone: '',
    mobilePhone: '',
    checkIn: toIsoDate(tomorrow),
    checkOut: toIsoDate(dayAfter),
    roomNumber: '',
    bedNumber: '',
    specialReason: '',
  }
}

function findStudentByEmergencyIdentity(users, studentNumber, registrationNumber) {
  const normalizedStudentNumber = String(studentNumber ?? '').trim().toLowerCase()
  const normalizedRegistrationNumber = String(registrationNumber ?? '').trim()

  return users.find(
    (user) =>
      user.roleGroup === 'student' &&
      (
        user.username.toLowerCase() === normalizedStudentNumber ||
        String(user.studentNumber ?? '').trim().toLowerCase() === normalizedStudentNumber ||
        String(user.registrationNumber ?? '').trim() === normalizedRegistrationNumber
      ),
  ) ?? null
}

function upsertUser(users, nextUser) {
  const existingIndex = users.findIndex((user) => user.username === nextUser.username)

  if (existingIndex === -1) {
    return [...users, nextUser]
  }

  return users.map((user) => (user.username === nextUser.username ? { ...user, ...nextUser } : user))
}

function normalizeSubjectValues(subjectValues) {
  if (Array.isArray(subjectValues)) {
    return subjectValues.map((value) => value.trim()).filter(Boolean)
  }

  return String(subjectValues ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function uniqueRoomOptions(availableBeds) {
  const roomNumbers = [...new Set(availableBeds.map((bed) => bed.roomNumber))]
  return roomNumbers.map((roomNumber) => ({
    value: String(roomNumber),
    label: `Room ${roomNumber}`,
  }))
}

function filterBookings(bookings, users, query) {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return bookings
  }

  return bookings.filter((booking) => {
    const student = users.find((user) => user.username === booking.studentUsername)

    return [
      booking.id,
      student?.name,
      student?.registrationNumber,
      booking.department,
      booking.courseCode,
      booking.academicActivity,
      booking.specialReason,
      ...getSpecialFeedbackEntries(booking).map((entry) => entry.message),
      booking.academicDecisionReason,
      booking.wardenDecisionReason,
      `room ${booking.roomNumber}`,
      `bed ${booking.bedNumber}`,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized))
  })
}

function parseIotLogRows(rawLog, bookings, users, deviceName) {
  return rawLog
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith('date,time,'))
    .map((line) => parseIotLogLine(line, bookings, users, deviceName))
    .filter(Boolean)
}

function parseIotLogLine(line, bookings, users, deviceName) {
  const [date, time, qrValue, scannedRole] = line.split(',').map((part) => part?.trim() ?? '')

  if (!date || !time || !qrValue) {
    return null
  }

  const booking = bookings.find((entry) => entry.qrValue === qrValue || entry.id === extractBookingId(qrValue))
  const student = users.find((user) => user.username === booking?.studentUsername)
  const verification = getScanVerification(booking)

  return {
    id: `SCAN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    scannedAt: `${date}T${time}`,
    qrValue,
    qrCodeName: booking?.id ?? extractBookingId(qrValue) ?? 'Unknown QR',
    role: scannedRole || student?.roleLabel || 'unknown',
    result: verification.result,
    message: verification.message,
    bookingId: booking?.id ?? '',
    studentUsername: booking?.studentUsername ?? '',
    deviceName: deviceName.trim() || 'ESP32-CAM QR Scanner',
  }
}

function getScanVerification(booking) {
  if (!booking) {
    return {
      result: 'not confirmed',
      message: 'QR code was not found in the hostel booking records.',
    }
  }

  if (getCurrentStatus(booking) !== 'approved') {
    return {
      result: 'not confirmed',
      message: 'Booking is not fully approved yet.',
    }
  }

  if (!isPaymentComplete(booking)) {
    return {
      result: 'not confirmed',
      message: 'Booking was approved, but payment is still pending.',
    }
  }

  return {
    result: 'confirmed',
    message: 'Approved and paid booking matched successfully.',
  }
}

function getApprovedPaidIotBookings(bookings) {
  return (bookings ?? []).filter(
    (booking) => getCurrentStatus(booking) === 'approved' && isPaymentComplete(booking) && booking.qrValue,
  )
}

function extractBookingId(qrValue) {
  if (!qrValue.includes('|')) {
    return qrValue || ''
  }

  return qrValue.split('|')[1] ?? ''
}

function mergeScanLogs(existingLogs, importedLogs, onMerged = () => {}) {
  const merged = [...existingLogs]
  const seenKeys = new Set(existingLogs.map(createScanLogKey))
  let addedCount = 0

  importedLogs.forEach((log) => {
    const key = createScanLogKey(log)
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      merged.unshift(log)
      addedCount += 1
    }
  })

  onMerged(addedCount)
  return merged
}

function createScanLogKey(log) {
  return [log.scannedAt, log.qrValue, log.role, log.deviceName].join('|')
}

function sortRecentFirst(left, right) {
  return new Date(right.createdAt) - new Date(left.createdAt)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(value)
}

function createBookingId() {
  return `BK-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
}

function getRejectionReason(booking) {
  if (booking.academicStatus === 'rejected') {
    return booking.academicDecisionReason ?? ''
  }

  if (booking.wardenStatus === 'rejected') {
    return booking.wardenDecisionReason ?? ''
  }

  return ''
}

function resolveAppState(state) {
  const fallbackState = state ?? createInitialState()
  const users = Array.isArray(fallbackState.users) ? fallbackState.users : []
  const reviewLogs = normalizeReviewLogs(fallbackState.reviewLogs ?? [])
  const bookings = (fallbackState.bookings ?? []).map((booking) =>
    applyAcademicReviewState(booking, users, reviewLogs),
  )

  return {
    ...fallbackState,
    users,
    reviewLogs,
    bookings,
  }
}

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return resolveAppState(createInitialState())
    }

    const parsed = JSON.parse(saved)
    const defaults = createInitialState()
    const resolvedUsers = mergeStoredUsers(defaults.users, parsed.users)
    const reviewLogs = normalizeReviewLogs(parsed.reviewLogs ?? [])
    const bookings = (parsed.bookings ?? defaults.bookings).map((booking) => ({
      ...booking,
      requestedDays:
        booking.requestedDays ?? calculateRequestedDays(booking.checkIn, booking.checkOut),
      roomNumber: normalizeRoomNumberByStudentGender(
        booking.roomNumber,
        resolvedUsers.find((user) => user.username === booking.studentUsername)?.gender,
      ),
      department: normalizeDepartment(booking.department),
      academicApproverUsername: normalizeAcademicUsername(booking.academicApproverUsername, booking.department),
      academicReviewedBy: normalizeAcademicUsername(booking.academicReviewedBy, booking.department),
      paymentTotal: calculatePaymentTotal(
        booking.requestedDays ?? calculateRequestedDays(booking.checkIn, booking.checkOut),
      ),
      paymentStatus: booking.paymentStatus ?? 'unpaid',
      paymentPaidAt: booking.paymentPaidAt ?? '',
      academicDecisionReason: booking.academicDecisionReason ?? '',
      wardenDecisionReason: booking.wardenDecisionReason ?? '',
      specialFeedbackRecipients: normalizeSpecialFeedbackRecipients(
        booking.specialFeedbackRecipients ?? booking.specialFeedbackRecipientUsername ?? [],
        booking.department,
      ),
      specialFeedbackRequestedBy: booking.specialFeedbackRequestedBy ?? '',
      specialFeedbackRequestedAt: booking.specialFeedbackRequestedAt ?? '',
      specialFeedbackEntries: normalizeSpecialFeedbackEntries(
        booking.specialFeedbackEntries ??
          buildLegacySpecialFeedbackEntries(
            booking.specialFeedbackProvidedBy ?? '',
            booking.specialFeedbackMessage ?? '',
            booking.specialFeedbackProvidedAt ?? '',
            booking.department,
          ),
        booking.department,
      ),
      studentClearedAt: booking.studentClearedAt ?? '',
      academicClearedBy: booking.academicClearedBy ?? [],
      wardenClearedBy: booking.wardenClearedBy ?? [],
    }))

    return resolveAppState({
      ...defaults,
      ...parsed,
      users: resolvedUsers,
      reviewLogs,
      bookings,
      iotLogUrl: resolveIotLogUrl(parsed.iotLogUrl),
      scanLogs:
        parsed.scanLogs?.map((log) => ({
          ...log,
          qrCodeName: log.qrCodeName ?? log.bookingId ?? 'Unknown QR',
          role: log.role ?? 'unknown',
          result: log.result ?? 'not confirmed',
          message: log.message ?? 'No scan message available.',
          deviceName: log.deviceName ?? 'ESP32-CAM QR Scanner',
        })) ?? createDemoScanLogs(resolvedUsers, bookings),
    })
  } catch {
    return resolveAppState(createInitialState())
  }
}

function resolveIotLogUrl(value = '') {
  return String(value ?? '').trim() || DEFAULT_IOT_LOG_URL
}

function mergeStoredUsers(defaultUsers, storedUsers) {
  const mergedUsers = new Map(defaultUsers.map((user) => [user.username, { ...user }]))

  ;(Array.isArray(storedUsers) ? storedUsers : []).forEach((user) => {
    const username = String(user?.username ?? '').trim()

    if (!username) {
      return
    }

    const previous = mergedUsers.get(username) ?? {}
    mergedUsers.set(username, {
      ...previous,
      ...user,
      username,
      password: user.password ?? previous.password ?? username,
    })
  })

  return Array.from(mergedUsers.values())
}

function normalizeDepartment(department) {
  const migrationMap = {
    ICT: 'Electrical and Computer Engineering',
    Management: 'Civil Engineering',
    'Business Administration': 'Agricultural and Plantation Engineering',
  }

  return migrationMap[department] ?? department ?? ''
}

function normalizeAcademicUsername(username, department) {
  const normalizedDepartment = normalizeDepartment(department)
  const migrationMap = {
    hodict: 'hodece',
    coordbiz: 'coordcivil',
  }

  if (migrationMap[username]) {
    return migrationMap[username]
  }

  if (!username && normalizedDepartment) {
    return getFallbackAcademicUsername(normalizedDepartment)
  }

  return username ?? ''
}

function normalizeSpecialFeedbackRecipients(value, department = '') {
  const normalizedValue = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim().startsWith('[')
      ? safeJsonParse(value, [])
      : String(value ?? '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)

  return [...new Set(
    normalizedValue
      .map((username) => normalizeAcademicUsername(username, department))
      .filter(Boolean),
  )]
}

function normalizeSpecialFeedbackEntries(entries, department = '') {
  const normalizedEntries = Array.isArray(entries)
    ? entries
    : typeof entries === 'string' && entries.trim().startsWith('[')
      ? safeJsonParse(entries, [])
      : []

  return normalizedEntries
    .map((entry) => ({
      actorUsername: normalizeAcademicUsername(entry?.actorUsername ?? '', department),
      message: String(entry?.message ?? '').trim(),
      providedAt: entry?.providedAt ?? '',
    }))
    .filter((entry) => entry.actorUsername && entry.message)
    .sort((left, right) => new Date(left.providedAt || 0) - new Date(right.providedAt || 0))
}

function buildLegacySpecialFeedbackEntries(actorUsername, message, providedAt, department = '') {
  if (!actorUsername || !message) {
    return []
  }

  return [{
    actorUsername: normalizeAcademicUsername(actorUsername, department),
    message,
    providedAt,
  }]
}

function normalizeReviewLogs(reviewLogs) {
  const normalizedLogs = Array.isArray(reviewLogs) ? reviewLogs : []
  const uniqueLogs = new Map()

  normalizedLogs
    .map((log) => ({
      bookingId: String(log?.bookingId ?? '').trim(),
      stage: String(log?.stage ?? '').trim(),
      action: String(log?.action ?? '').trim(),
      actorUsername: normalizeAcademicUsername(String(log?.actorUsername ?? '').trim(), ''),
      decisionReason: String(log?.decisionReason ?? '').trim(),
      actionAt: log?.actionAt ?? '',
    }))
    .filter((log) => log.bookingId && log.stage && log.action && log.actorUsername)
    .sort((left, right) => new Date(left.actionAt || 0) - new Date(right.actionAt || 0))
    .forEach((log) => {
      uniqueLogs.set(createReviewLogKey(log), log)
    })

  return Array.from(uniqueLogs.values())
}

function upsertBookingReviewLog(reviewLogs, nextReviewLog) {
  return normalizeReviewLogs([...(reviewLogs ?? []), nextReviewLog])
}

function createReviewLogKey(log) {
  return [log.bookingId, log.stage, log.actorUsername, log.actionAt].join('|')
}

function applyAcademicReviewState(booking, users, reviewLogs) {
  if (booking.workflow !== 'regular' || WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)) {
    return {
      ...booking,
      academicReviewTeamUsernames: [],
      academicPendingReviewerUsernames: [],
      academicApprovedReviewerUsernames: [],
      academicRejectedReviewerUsernames: [],
      academicReviewEntries: [],
    }
  }

  const reviewTeam = getRegularAcademicReviewUsers(users, booking)
  const reviewTeamUsernames = reviewTeam.map((user) => user.username)
  const latestReviewLogsByActor = buildLatestReviewLogMap(reviewLogs, booking.id, 'academic')
  const relevantReviewLogs = Array.from(latestReviewLogsByActor.values())
    .filter((log) => !reviewTeamUsernames.length || reviewTeamUsernames.includes(log.actorUsername))
    .sort((left, right) => new Date(left.actionAt || 0) - new Date(right.actionAt || 0))
  const approvedReviewerUsernames = reviewTeamUsernames.filter(
    (username) => latestReviewLogsByActor.get(username)?.action === 'approved',
  )
  const rejectedReviewLogs = relevantReviewLogs.filter((log) => log.action === 'rejected')
  const rejectedReviewerUsernames = [...new Set(rejectedReviewLogs.map((log) => log.actorUsername))]
  const pendingReviewerUsernames = reviewTeamUsernames.filter(
    (username) => !latestReviewLogsByActor.has(username),
  )
  const hasAcademicApproval = approvedReviewerUsernames.length > 0
  const preserveLegacyFinalState =
    (booking.academicStatus === 'approved' || booking.academicStatus === 'rejected') &&
    !hasAcademicApproval &&
    !rejectedReviewerUsernames.length

  if (rejectedReviewerUsernames.length) {
    const latestRejection = rejectedReviewLogs.at(-1)

    return {
      ...booking,
      academicStatus: 'rejected',
      academicReviewedBy: latestRejection?.actorUsername ?? booking.academicReviewedBy ?? '',
      academicReviewedAt: latestRejection?.actionAt ?? booking.academicReviewedAt ?? '',
      academicDecisionReason: latestRejection?.decisionReason || booking.academicDecisionReason || '',
      academicReviewTeamUsernames: reviewTeamUsernames,
      academicPendingReviewerUsernames: [],
      academicApprovedReviewerUsernames: approvedReviewerUsernames,
      academicRejectedReviewerUsernames: rejectedReviewerUsernames,
      academicReviewEntries: relevantReviewLogs,
    }
  }

  if (hasAcademicApproval) {
    const latestApproval = relevantReviewLogs.filter((log) => log.action === 'approved').at(-1)

    return {
      ...booking,
      academicStatus: 'approved',
      academicReviewedBy: latestApproval?.actorUsername ?? booking.academicReviewedBy ?? '',
      academicReviewedAt: latestApproval?.actionAt ?? booking.academicReviewedAt ?? '',
      academicDecisionReason: '',
      academicReviewTeamUsernames: reviewTeamUsernames,
      academicPendingReviewerUsernames: [],
      academicApprovedReviewerUsernames: approvedReviewerUsernames,
      academicRejectedReviewerUsernames: [],
      academicReviewEntries: relevantReviewLogs,
    }
  }

  if (preserveLegacyFinalState) {
    const legacyReviewerUsernames = getLegacyAcademicReviewerUsernames(booking)

    return {
      ...booking,
      academicReviewTeamUsernames: reviewTeamUsernames,
      academicPendingReviewerUsernames: [],
      academicApprovedReviewerUsernames:
        booking.academicStatus === 'approved' ? legacyReviewerUsernames : approvedReviewerUsernames,
      academicRejectedReviewerUsernames:
        booking.academicStatus === 'rejected' ? legacyReviewerUsernames : [],
      academicReviewEntries: relevantReviewLogs,
    }
  }

  const latestReview = relevantReviewLogs.at(-1)

  return {
    ...booking,
    academicStatus: 'pending',
    academicReviewedBy: latestReview?.actorUsername ?? booking.academicReviewedBy ?? '',
    academicReviewedAt: latestReview?.actionAt ?? booking.academicReviewedAt ?? '',
    academicDecisionReason: '',
    academicReviewTeamUsernames: reviewTeamUsernames,
    academicPendingReviewerUsernames: pendingReviewerUsernames,
    academicApprovedReviewerUsernames: approvedReviewerUsernames,
    academicRejectedReviewerUsernames: [],
    academicReviewEntries: relevantReviewLogs,
  }
}

function buildLatestReviewLogMap(reviewLogs, bookingId, stage) {
  const latestLogs = new Map()

  ;(reviewLogs ?? [])
    .filter((log) => log.bookingId === bookingId && log.stage === stage)
    .sort((left, right) => new Date(left.actionAt || 0) - new Date(right.actionAt || 0))
    .forEach((log) => {
      latestLogs.set(log.actorUsername, log)
    })

  return latestLogs
}

function getLegacyAcademicReviewerUsernames(booking) {
  return booking.academicReviewedBy ? [booking.academicReviewedBy] : []
}

function formatPersonLabelList(people) {
  const labels = people.map(formatShortPersonLabel).filter(Boolean)

  if (!labels.length) {
    return 'N/A'
  }

  if (labels.length === 1) {
    return labels[0]
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

function formatShortPersonLabel(person) {
  if (!person) {
    return ''
  }

  if (isStudentCounselor(person)) {
    return 'Student counselor'
  }

  if (person.roleLabel === 'Head of Department (HOD)' && person.department) {
    return `HOD (${person.department})`
  }

  if (person.roleLabel === 'Academic coordinator' && person.department) {
    return `Academic coordinator (${person.department})`
  }

  return person.name || person.roleLabel || ''
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function getFallbackAcademicUsername(department) {
  const fallbackMap = {
    'Agricultural and Plantation Engineering': 'hodape',
    'Civil Engineering': 'hodcivil',
    'Electrical and Computer Engineering': 'hodece',
    'Mechanical Engineering': 'hodmech',
    'Mathematics and Philosophy of Engineering': 'hodmpe',
    'Textile and Apparel Technology': 'hodtat',
  }

  return fallbackMap[department] ?? ''
}

function normalizeRoomNumberByStudentGender(roomNumber, gender) {
  if (typeof roomNumber !== 'number') {
    return roomNumber
  }

  if (gender === 'Female' && roomNumber > TOTAL_ROOMS / 2) {
    return roomNumber - TOTAL_ROOMS / 2
  }

  if (gender === 'Male' && roomNumber <= TOTAL_ROOMS / 2) {
    return roomNumber + TOTAL_ROOMS / 2
  }

  return roomNumber
}

export default App
