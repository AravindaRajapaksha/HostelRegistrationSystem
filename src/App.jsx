import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './App.css'
import {
  ACADEMIC_ACTIVITY_OPTIONS,
  BEDS_PER_ROOM,
  CONTACTS,
  DAILY_FEE,
  DEPARTMENT_OPTIONS,
  RULE_GROUPS,
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

const STORAGE_KEY = 'hostel-system-demo-state-v1'
const SESSION_KEY = 'hostel-system-demo-session-v1'

function scrollPageToTop(behavior = 'smooth') {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior,
  })
}

function App() {
  const [appState, setAppState] = useState(loadState)
  const [session, setSession] = useState(null)
  const [activeView, setActiveView] = useState('home')
  const [feedback, setFeedback] = useState(
    'Use one of the demo accounts below to explore the TRF hostel workflow.',
  )

  const currentUser = appState.users.find((user) => user.username === session?.username) ?? null

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState))
  }, [appState])

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

  function handleLogin({ username, password }) {
    const normalizedUsername = username.trim().toLowerCase()
    const user = appState.users.find(
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

  function submitBooking(formValues) {
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

    if (!formValues.department) {
      setFeedback(
        formValues.workflow === 'regular'
          ? 'Select the department for the academic TRF booking request.'
          : 'Select the department before submitting the special reason TRF booking request.',
      )
      return
    }

    if (!selectedSubjects.length) {
      setFeedback(
        formValues.workflow === 'regular'
          ? 'Select the subject code before submitting the academic TRF booking request.'
          : 'Select the subject code before submitting the special reason TRF booking request.',
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

    setAppState((previous) => ({ ...previous, bookings: [booking, ...previous.bookings] }))
    setActiveView('bookings')
    setFeedback(`Booking ${booking.id} was created and routed for approval.`)
  }

  function decideAcademic(bookingId, decision, reason = '') {
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

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.academicStatus !== 'pending') {
          return booking
        }

        return {
          ...booking,
          academicStatus: decision,
          academicReviewedBy: currentUser.username,
          academicReviewedAt: toIsoDate(new Date()),
          academicDecisionReason: decision === 'rejected' ? reason.trim() : '',
        }
      }),
    }))

    setFeedback(
      decision === 'approved'
        ? `Academic approval recorded for ${bookingId}.`
        : `Academic rejection recorded for ${bookingId} with the not-approved reason.`,
    )
  }

  function decideWarden(bookingId, decision, reason = '') {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      return
    }

    if (decision === 'rejected' && !reason.trim()) {
      setFeedback('Add the not-approved reason before rejecting the booking request.')
      return
    }

    setAppState((previous) => {
      const targetBooking = previous.bookings.find(
        (booking) => booking.id === bookingId && booking.wardenStatus === 'pending',
      )

      if (!targetBooking) {
        return previous
      }

      return {
        ...previous,
        bookings: previous.bookings.map((booking) => {
          if (booking.id === bookingId) {
            return {
              ...booking,
              wardenStatus: decision,
              wardenReviewedBy: currentUser.username,
              wardenReviewedAt: toIsoDate(new Date()),
              wardenDecisionReason: decision === 'rejected' ? reason.trim() : '',
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
              wardenReviewedAt: toIsoDate(new Date()),
              wardenDecisionReason:
                'Automatically not approved because another overlapping request for this room and bed was approved first.',
            }
          }

          return booking
        }),
      }
    })

    setFeedback(
      decision === 'approved'
        ? `Warden approval recorded for ${bookingId}. Availability was updated for overlapping requests.`
        : `Warden rejection recorded for ${bookingId} with the not-approved reason.`,
    )
  }

  function payBooking(bookingId) {
    if (!currentUser || currentUser.roleGroup !== 'student') {
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.studentUsername !== currentUser.username) {
          return booking
        }

        return {
          ...booking,
          paymentStatus: 'paid',
          paymentPaidAt: toIsoDate(new Date()),
        }
      }),
    }))

    setFeedback(`Payment completed for ${bookingId}. The QR code is now available.`)
  }

  function cancelBooking(bookingId) {
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

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.studentUsername !== currentUser.username) {
          return booking
        }

        return {
          ...booking,
          cancelledAt: toIsoDate(new Date()),
        }
      }),
    }))

    setFeedback(`Booking ${bookingId} was cancelled successfully.`)
  }

  function clearStudentBookingHistory(bookingId) {
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
    const canClear = (status === 'approved' && isPaymentComplete(targetBooking)) || status === 'cancelled'

    if (!canClear) {
      setFeedback(`Booking ${bookingId} cannot be cleared from history yet.`)
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.studentUsername !== currentUser.username) {
          return booking
        }

        return {
          ...booking,
          studentClearedAt: toIsoDate(new Date()),
        }
      }),
    }))

    setFeedback(`Booking ${bookingId} was cleared from your history.`)
  }

  function clearAcademicBookingHistory(bookingId) {
    if (!currentUser || currentUser.roleGroup !== 'academic') {
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId) {
          return booking
        }

        return {
          ...booking,
          academicClearedBy: [...new Set([...(booking.academicClearedBy ?? []), currentUser.username])],
        }
      }),
    }))

    setFeedback(`Booking ${bookingId} was cleared from your academic history.`)
  }

  function clearWardenBookingHistory(bookingId) {
    if (!currentUser || currentUser.roleGroup !== 'warden') {
      return
    }

    setAppState((previous) => ({
      ...previous,
      bookings: previous.bookings.map((booking) => {
        if (booking.id !== bookingId) {
          return booking
        }

        return {
          ...booking,
          wardenClearedBy: [...new Set([...(booking.wardenClearedBy ?? []), currentUser.username])],
        }
      }),
    }))

    setFeedback(`Booking ${bookingId} was cleared from your warden history.`)
  }

  function updateIotLogUrl(nextUrl) {
    setAppState((previous) => ({
      ...previous,
      iotLogUrl: nextUrl,
    }))

    if (nextUrl.trim()) {
      setFeedback('ESP32 log URL saved. QR confirmation sync will keep checking the device log.')
      return
    }

    setFeedback('ESP32 log URL cleared. Automatic IoT sync is now turned off.')
  }

  function importScanLogs({ deviceName, rawLog, silent = false }) {
    const importedLogs = parseIotLogRows(rawLog, appState.bookings, appState.users, deviceName)

    if (!importedLogs.length) {
      if (!silent) {
        setFeedback('No valid IoT log rows were found in the ESP32 scanner log.')
      }
      return 0
    }

    let addedCount = 0
    setAppState((previous) => ({
      ...previous,
      scanLogs: mergeScanLogs(previous.scanLogs ?? [], importedLogs, (count) => {
        addedCount = count
      }),
    }))

    if (addedCount > 0) {
      setFeedback(`${addedCount} new IoT scan confirmation row(s) were added to the warden history.`)
    } else if (!silent) {
      setFeedback('No new IoT scan rows were found in the scanner log.')
    }

    return addedCount
  }

  async function syncIotLogFromUrl({ deviceName, silent = false, targetUrl: providedUrl = '' }) {
    const targetUrl = (providedUrl || appState.iotLogUrl || '').trim()

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
        currentUser,
        onAcademicDecision: decideAcademic,
        onCancelBooking: cancelBooking,
        onClearAcademicBooking: clearAcademicBookingHistory,
        onClearStudentBooking: clearStudentBookingHistory,
        onClearWardenBooking: clearWardenBookingHistory,
        onPayBooking: payBooking,
        onSubmitBooking: submitBooking,
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
  currentUser,
  onAcademicDecision,
  onCancelBooking,
  onClearAcademicBooking,
  onClearStudentBooking,
  onClearWardenBooking,
  onPayBooking,
  onSubmitBooking,
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
          onCancel={onCancelBooking}
          onClear={onClearStudentBooking}
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
      .filter((booking) => canAcademicUserReviewBooking(currentUser, booking))
      .sort(sortRecentFirst)

    if (activeView === 'dashboard') {
      return (
        <AcademicDashboardView
          bookings={relevant.filter((booking) => booking.academicStatus === 'pending')}
          currentUser={currentUser}
          users={appState.users}
          onDecision={onAcademicDecision}
        />
      )
    }

    if (activeView === 'approved') {
      return (
        <DecisionListView
          bookings={relevant.filter((booking) => booking.academicStatus === 'approved')}
          onClear={onClearAcademicBooking}
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
          bookings={relevant.filter((booking) => getCurrentStatus(booking) === 'not approved')}
          onClear={onClearAcademicBooking}
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
          (booking) =>
            WARDEN_ONLY_WORKFLOWS.includes(booking.workflow) && booking.wardenStatus === 'pending',
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
        onSyncIotLog={onSyncIotLog}
        onUpdateIotLogUrl={onUpdateIotLogUrl}
        scanLogs={appState.scanLogs ?? []}
        users={appState.users}
      />
    )
  }

  if (activeView === 'emergency') {
    return (
      <DecisionListView
        bookings={relevant.filter(
          (booking) => booking.workflow === 'special' && booking.wardenStatus === 'approved',
        )}
        onClear={onClearWardenBooking}
        currentUser={currentUser}
        emptyCopy="No emergency permission records are available yet."
        showQr
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
          <article className="panel-card">
            <h3>TRF Rules</h3>
            <div className="rule-grid single-column">
              <div className="mini-card">
                <h4>Common rules</h4>
              </div>
              <div className="mini-card">
                <h4>Reading room rules</h4>
              </div>
              <div className="mini-card">
                <h4>Bedroom rules</h4>
              </div>
              <div className="mini-card">
                <h4>Rule breaking punishments</h4>
              </div>
            </div>
          </article>

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
        <article className="panel-card">
          <h3>TRF Rules</h3>
          <div className="rule-grid">
            {RULE_GROUPS.map((group) => (
              <div className="mini-card" key={group.title}>
                <h4>{group.title}</h4>
                <ul className="plain-list">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>

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

function StudentBookingsView({ bookings, onCancel, onClear, onPay, users }) {
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

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">My bookings</div>
          <h2>Submitted bookings, approvals, and payment</h2>
        </div>
      </div>

      {visibleBookings.length ? (
        <div className="card-list">
          {visibleBookings.map((booking) => {
            const status = getCurrentStatus(booking)
            const paid = isPaymentComplete(booking)
            const canCancel = !booking.cancelledAt && !paid && status === 'pending academic'
            const canClear = (status === 'approved' && paid) || status === 'cancelled' || status === 'not approved'

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

function AcademicDashboardView({ bookings, currentUser, onDecision, users }) {
  const [query, setQuery] = useState('')
  const filtered = filterBookings(bookings, users, query)

  return (
    <ApprovalQueue
      bookings={filtered}
      currentUser={currentUser}
      onApprove={(id) => onDecision(id, 'approved')}
      onReject={(id, reason) => onDecision(id, 'rejected', reason)}
      query={query}
      searchLabel="Search pending requests"
      setQuery={setQuery}
      title="Academic Notifications"
      users={users}
    />
  )
}

function WardenDashboardView({ bookings, currentUser, onDecision, title = 'Warden Notifications', users }) {
  const [query, setQuery] = useState('')
  const filtered = filterBookings(bookings, users, query)

  return (
    <ApprovalQueue
      bookings={filtered}
      currentUser={currentUser}
      onApprove={(id) => onDecision(id, 'approved')}
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
                  <button className="primary-button" onClick={() => onApprove(booking.id)} type="button">
                    Approve
                  </button>
                  <button className="ghost-button" onClick={() => openRejectDialog(booking)} type="button">
                    Not approve
                  </button>
                </div>
              }
              booking={booking}
              collapsible
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

function DecisionListView({ bookings, currentUser, emptyCopy, onClear = null, showQr = false, title, users }) {
  const [query, setQuery] = useState('')
  const filtered = filterBookings(
    bookings.filter((booking) => !isHistoryClearedForUser(booking, currentUser)),
    users,
    query,
  )

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{currentUser.roleLabel}</div>
          <h2>{title}</h2>
        </div>
        <label className="search-field">
          <span>Search</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student details, booking id, or room"
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

function BookingCard({ action = null, booking, collapsible = false, showQr = false, users }) {
  const student = users.find((user) => user.username === booking.studentUsername)
  const academicReviewer = users.find((user) => user.username === booking.academicReviewedBy)
  const wardenReviewer = users.find((user) => user.username === booking.wardenReviewedBy)
  const academicApproverUsers = getAcademicApproverUsers(users, booking)
  const wardenApproverUsers = getWardenApproverUsers(users, booking)
  const [isExpanded, setIsExpanded] = useState(!collapsible)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)

  const paymentStatusLabel = booking.paymentStatus ?? 'unpaid'
  const canShowQr = showQr && isPaymentComplete(booking)
  const status = getCurrentStatus(booking)
  const isWardenOnlyBooking = WARDEN_ONLY_WORKFLOWS.includes(booking.workflow)
  const rejectionReason = getRejectionReason(booking)
  const summaryLabel =
    status === 'not approved'
      ? 'Request not approved'
      : status === 'approved' && !isPaymentComplete(booking)
      ? `Payment ${formatCurrency(booking.paymentTotal)} pending`
      : status === 'approved' && isPaymentComplete(booking)
        ? 'Paid and QR ready'
        : 'Submitted and waiting for review'
  const bookingTypeLabel =
    booking.workflow === 'special'
      ? 'Special reason booking'
      : 'Academic TRF booking'
  const bookingSummaryDetails =
    booking.workflow === 'special' && booking.specialReason
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
                ['Special reason', booking.specialReason || 'No'],
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
                  isWardenOnlyBooking
                    ? 'Not required'
                    : academicReviewer
                      ? `${academicReviewer.roleLabel} - ${academicReviewer.name}`
                      : booking.academicStatus === 'pending'
                        ? 'Pending'
                        : booking.academicStatus,
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
                <div className={isWardenOnlyBooking ? 'modal-grid single-column' : 'modal-grid'}>
                  {isWardenOnlyBooking ? null : (
                    <StaffContactGroup
                      emptyCopy="No academic approvers assigned."
                      people={academicApproverUsers}
                      title="Academic approver details"
                    />
                  )}
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

  function handleConnect(event) {
    event.preventDefault()
    onUpdateIotLogUrl(draftUrl)
    onSyncIotLog({ deviceName, targetUrl: draftUrl })
  }

  function handleDisconnect() {
    setDraftUrl('')
    onUpdateIotLogUrl('')
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

function Field({ label, name, onChange, type = 'text', value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  )
}

function SelectField({ label, name, onChange, options, value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TextAreaField({ label, name, onChange, value }) {
  return (
    <label className="field full-span">
      <span>{label}</span>
      <textarea name={name} onChange={(event) => onChange(event.target.value)} rows="5" value={value} />
    </label>
  )
}

function QrPreview({ bookingId = 'booking', value }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let mounted = true

    QRCode.toDataURL(value, {
      margin: 1,
      width: 220,
      color: {
        dark: '#173c72',
        light: '#f7fbff',
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
    users.find(
      (user) =>
        user.roleGroup === 'academic' &&
        user.roleLabel === 'Head of Department (HOD)' &&
        user.department === department,
    ) ??
    users.find(
      (user) =>
        user.roleGroup === 'academic' &&
        user.roleLabel === 'Academic coordinator' &&
        user.department === department,
    ) ??
    users.find((user) => isStudentCounselor(user)) ??
    null
  )
}

function canAcademicUserReviewBooking(user, booking) {
  if (user.roleGroup !== 'academic' || booking.workflow !== 'regular') {
    return false
  }

  return isStudentCounselor(user) || user.department === booking.department
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

  return users.filter(
    (user) =>
      user.roleGroup === 'academic' &&
      (user.department === booking.department || isStudentCounselor(user)),
  )
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

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      return createInitialState()
    }

    const parsed = JSON.parse(saved)
    const defaults = createInitialState()
    const resolvedUsers = defaults.users
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
      studentClearedAt: booking.studentClearedAt ?? '',
      academicClearedBy: booking.academicClearedBy ?? [],
      wardenClearedBy: booking.wardenClearedBy ?? [],
    }))

    return {
      ...defaults,
      ...parsed,
      users: resolvedUsers,
      bookings,
      iotLogUrl: parsed.iotLogUrl ?? '',
      scanLogs:
        parsed.scanLogs?.map((log) => ({
          ...log,
          qrCodeName: log.qrCodeName ?? log.bookingId ?? 'Unknown QR',
          role: log.role ?? 'unknown',
          result: log.result ?? 'not confirmed',
          message: log.message ?? 'No scan message available.',
          deviceName: log.deviceName ?? 'ESP32-CAM QR Scanner',
        })) ?? createDemoScanLogs(resolvedUsers, bookings),
    }
  } catch {
    return createInitialState()
  }
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
