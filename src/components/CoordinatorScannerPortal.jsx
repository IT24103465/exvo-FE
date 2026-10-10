import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getCoordinatorEvents, verifyCoordinatorAccess, validateTicketCheckIn } from '../services/coordinatorService'

// Play audio feedback using Web Audio API
const playFeedbackSound = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    if (type === 'VALID') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
      osc.start(now)
      osc.stop(now + 0.25)
    } else if (type === 'DUPLICATE') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.setValueAtTime(330, now + 0.12)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
    } else {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, now)
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.2)
      gain.gain.setValueAtTime(0.35, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
    }
  } catch {
    // AudioContext blocked or unavailable in environment
  }
}

export default function CoordinatorScannerPortal({ user, onBack, ExvoLogo, initialSelectedEvent = null }) {
  // ── Role-Based Access Control (RBAC) ──
  const isAuthorizedScanner = Boolean(
    user && (user.role === 'Organizer' || user.role === 'Company' || user.role === 'Admin'),
  )

  // ── State Management ──
  const [events, setEvents] = useState([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [eventsError, setEventsError] = useState(null)
  const [eventSearch, setEventSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('all') // 'all' | 'today' | 'upcoming' | 'past'

  // Scanner state (can be initialized directly from organizer dashboard)
  const [selectedEvent, setSelectedEvent] = useState(initialSelectedEvent)
  const [verifyingAccess, setVerifyingAccess] = useState(false)
  const [accessError, setAccessError] = useState(null)

  // Device/Viewport Mode (Mobile camera vs Web Terminal manual entry)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    const nav = typeof globalThis.navigator !== 'undefined' ? globalThis.navigator : null
    return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent || '')
  })

  // Responsive resize watcher
  useEffect(() => {
    const handleResize = () => {
      const nav = typeof globalThis.navigator !== 'undefined' ? globalThis.navigator : null
      const mobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent || '')
      setIsMobile(mobile)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Camera & Scan state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'environment' | 'user'
  const [torchOn, setTorchOn] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [scanning, setScanning] = useState(false)

  // Validation Result
  const [lastScanResult, setLastScanResult] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [historySearch, setHistorySearch] = useState('')

  const videoRef = useRef(null)
  const streamRef = useRef(null)

  // ── Load Assigned Events ──
  const loadAssignedEvents = useCallback(async () => {
    if (!isAuthorizedScanner) return
    setLoadingEvents(true)
    setEventsError(null)
    try {
      const data = await getCoordinatorEvents()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      setEventsError(err.message || 'Failed to load assigned events.')
    } finally {
      setLoadingEvents(false)
    }
  }, [isAuthorizedScanner])

  useEffect(() => {
    if (isAuthorizedScanner) {
      loadAssignedEvents()
    }
  }, [isAuthorizedScanner, loadAssignedEvents])

  // ── Stop Camera Stream Helper ──
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setTorchOn(false)
  }, [])

  // ── Start Camera Stream (Mobile Viewport Only) ──
  const startCameraStream = useCallback(async () => {
    if (!isMobile) {
      stopCameraStream()
      return
    }
    setCameraError(null)
    stopCameraStream()
    const nav = typeof window !== 'undefined' ? window.navigator : null
    if (!nav?.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported by your browser.')
      return
    }

    try {
      const stream = await nav.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
      setCameraActive(true)
    } catch (err) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access or use manual code entry.'
          : 'Could not activate camera viewfinder. You can still use manual ticket entry.',
      )
      setCameraActive(false)
    }
  }, [isMobile, facingMode, stopCameraStream])

  // Toggle Torch if supported
  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    const capabilities = track.getCapabilities ? track.getCapabilities() : {}
    if (capabilities.torch) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn }],
        })
        setTorchOn(!torchOn)
      } catch {
        // Torch constraint error
      }
    } else {
      setTorchOn(!torchOn)
    }
  }

  // Effect to clean up camera on unmount or when leaving scanner view
  useEffect(() => {
    return () => {
      stopCameraStream()
    }
  }, [stopCameraStream])

  // Auto-start camera when entering scanner view on mobile devices
  useEffect(() => {
    if (selectedEvent && isMobile) {
      startCameraStream()
    } else {
      stopCameraStream()
    }
  }, [selectedEvent, isMobile, facingMode, startCameraStream, stopCameraStream])

  // ── Event Selection & Access Verification ──
  const handleSelectEvent = async (eventItem) => {
    setVerifyingAccess(true)
    setAccessError(null)
    setLastScanResult(null)
    try {
      const eventId = eventItem.eventId || eventItem.id
      await verifyCoordinatorAccess(eventId)
      setSelectedEvent(eventItem)
    } catch (err) {
      setAccessError(err.message || 'Access verification failed for this event.')
    } finally {
      setVerifyingAccess(false)
    }
  }

  // ── Process Ticket Code Verification ──
  const handleProcessScan = async (codeToVerify) => {
    const code = String(codeToVerify || '').trim()
    if (!code || !selectedEvent || scanning) return

    setScanning(true)
    const eventId = selectedEvent.eventId || selectedEvent.id

    // Check for duplicate in current session scan history
    const existingScan = scanHistory.find(
      (item) => item.ticketCode.toUpperCase() === code.toUpperCase() && item.status === 'VALID',
    )

    if (existingScan) {
      const duplicateResult = {
        ticketCode: code,
        eventId,
        isValid: false,
        status: 'DUPLICATE',
        attendeeName: existingScan.attendeeName || 'Attendee',
        ticketType: existingScan.ticketType || 'Standard',
        seatCode: existingScan.seatCode || 'General',
        checkedInAt: new Date().toISOString(),
        firstCheckedInAt: existingScan.checkedInAt,
        message: `Already checked in at ${new Date(existingScan.checkedInAt).toLocaleTimeString()}`,
      }
      playFeedbackSound('DUPLICATE')
      setLastScanResult(duplicateResult)
      setScanHistory((prev) => [duplicateResult, ...prev])
      setScanning(false)
      setManualCode('')
      return
    }

    try {
      const response = await validateTicketCheckIn(eventId, code)
      const isSuccess = response.isValid !== false && response.status !== 'INVALID'
      const status = isSuccess ? 'VALID' : 'INVALID'

      const result = {
        ticketCode: code,
        eventId,
        isValid: isSuccess,
        status,
        attendeeName: response.attendeeName || 'Verified Guest',
        ticketType: response.ticketType || (code.toUpperCase().includes('VIP') ? 'VIP Pass' : 'General Admission'),
        seatCode: response.seatCode || (code.length > 8 ? `S-${code.slice(-3).toUpperCase()}` : 'General'),
        checkedInAt: response.checkedInAt || new Date().toISOString(),
        message: response.message || (isSuccess ? 'Check-in confirmed!' : 'Ticket verification rejected'),
      }

      playFeedbackSound(status)
      setLastScanResult(result)
      setScanHistory((prev) => [result, ...prev])
    } catch (err) {
      const failedResult = {
        ticketCode: code,
        eventId,
        isValid: false,
        status: 'INVALID',
        attendeeName: 'Unknown',
        ticketType: 'Unknown',
        seatCode: 'None',
        checkedInAt: new Date().toISOString(),
        message: err.message || 'Invalid or unrecognized ticket code.',
      }
      playFeedbackSound('INVALID')
      setLastScanResult(failedResult)
      setScanHistory((prev) => [failedResult, ...prev])
    } finally {
      setScanning(false)
      setManualCode('')
    }
  }

  // Handle Manual Code Submit
  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (manualCode.trim()) {
      handleProcessScan(manualCode.trim())
    }
  }

  // ── Filtered Events Calculations ──
  const filteredEvents = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    return events.filter((evt) => {
      const title = (evt.title || '').toLowerCase()
      const venue = (evt.venue || '').toLowerCase()
      const loc = (evt.location || '').toLowerCase()
      const query = eventSearch.trim().toLowerCase()

      const matchesSearch = !query || title.includes(query) || venue.includes(query) || loc.includes(query)
      if (!matchesSearch) return false

      const evtDateStr = evt.eventDate ? evt.eventDate.split('T')[0] : ''
      if (eventFilter === 'today') return evtDateStr === todayStr
      if (eventFilter === 'upcoming') return evtDateStr >= todayStr
      if (eventFilter === 'past') return evtDateStr < todayStr
      return true
    })
  }, [events, eventSearch, eventFilter])

  // Filtered Scan History
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return scanHistory
    const q = historySearch.toLowerCase()
    return scanHistory.filter(
      (h) =>
        h.ticketCode.toLowerCase().includes(q) ||
        (h.attendeeName && h.attendeeName.toLowerCase().includes(q)) ||
        h.status.toLowerCase().includes(q),
    )
  }, [scanHistory, historySearch])

  // Stats
  const validScansCount = scanHistory.filter((s) => s.status === 'VALID').length
  const duplicateScansCount = scanHistory.filter((s) => s.status === 'DUPLICATE').length
  const invalidScansCount = scanHistory.filter((s) => s.status === 'INVALID').length

  // ── If NOT an authorized scanner, render RBAC barrier ──
  if (!isAuthorizedScanner) {
    return (
      <main className="coordinator-portal-page" role="main" aria-label="Access Scanner Portal">
        <div className="coordinator-bg-glow" />
        <header className="coordinator-header">
          <button type="button" className="coordinator-back-btn" onClick={onBack}>
            ← Back to Home
          </button>
          <div className="coordinator-brand">
            {ExvoLogo && <ExvoLogo />}
            <span className="font-['Orbitron'] font-black text-xl tracking-wider text-white">
              <span className="text-[#FF0000]">EX</span>VO
            </span>
          </div>
        </header>

        <section className="coordinator-shell">
          <div className="coordinator-rbac-card" role="alert">
            <div className="coordinator-rbac-icon" aria-hidden="true">
              <svg
                className="w-14 h-14 text-red-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <h1 className="coordinator-rbac-title font-['Orbitron']">ACCESS RESTRICTED</h1>
            <p className="coordinator-rbac-kicker">ORGANIZER CLEARANCE REQUIRED</p>
            <p className="coordinator-rbac-desc">
              This terminal is strictly reserved for verified <strong>Event Organizers</strong> and administrators. Your
              current account role (<code>{user?.role || 'Guest'}</code>) does not have authorization to scan tickets or
              access the gate verification portal.
            </p>
            <div className="coordinator-rbac-actions">
              <button type="button" className="coordinator-primary-btn" onClick={onBack}>
                RETURN TO HOMEPAGE
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  // ── Render Dedicated Coordinator Portal ──
  return (
    <main className="coordinator-portal-page" role="main" aria-label="Access Coordinator Scanner Portal">
      <div className="coordinator-bg-glow" />

      {/* Top Header */}
      <header className="coordinator-header">
        <div className="coordinator-header-left">
          <button type="button" className="coordinator-back-btn" onClick={onBack}>
            <span aria-hidden="true">←</span>
            <span>BACK</span>
          </button>
          <div className="coordinator-brand">
            {ExvoLogo && <ExvoLogo />}
            <span className="font-['Orbitron'] font-black text-xl tracking-wider text-white">
              <span className="text-[#FF0000]">EX</span>VO
            </span>
            <span className="coordinator-badge font-['Orbitron']">SCANNER PORTAL</span>
          </div>
        </div>

        <div className="coordinator-header-right">
          <div className="coordinator-user-pill">
            <span className="coordinator-status-dot" aria-hidden="true" />
            <span className="coordinator-user-name">{user?.fullName || user?.name || 'Organizer'}</span>
            <span className="coordinator-role-tag">{user?.role || 'ORGANIZER'}</span>
          </div>
          <button
            type="button"
            className="coordinator-sync-btn"
            onClick={loadAssignedEvents}
            disabled={loadingEvents}
            title="Sync assigned events"
          >
            {loadingEvents ? 'SYNCING...' : 'SYNC'}
          </button>
        </div>
      </header>

      <section className="coordinator-shell">
        {/* Metric Cards Bar */}
        <div className="coordinator-stats-bar">
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num">{events.length}</span>
            <span className="coordinator-stat-label">ASSIGNED EVENTS</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-emerald-400">{validScansCount}</span>
            <span className="coordinator-stat-label">CHECKED IN (VALID)</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-amber-400">{duplicateScansCount}</span>
            <span className="coordinator-stat-label">DUPLICATES</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-red-400">{invalidScansCount}</span>
            <span className="coordinator-stat-label">REJECTED</span>
          </div>
        </div>

        {/* Access Verification Error Toast */}
        {accessError && (
          <div className="coordinator-alert coordinator-alert--error" role="alert">
            <svg
              className="w-5 h-5 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{accessError}</span>
            <button type="button" onClick={() => setAccessError(null)} className="coordinator-alert-close">
              ✕
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* VIEW A: EVENT SELECTION (When no event is actively selected)           */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {!selectedEvent && (
          <div className="coordinator-events-view">
            <div className="coordinator-section-header">
              <div>
                <p className="coordinator-kicker">GATE ASSIGNMENTS</p>
                <h1 className="coordinator-heading font-['Orbitron']">Select Event to Launch Scanner</h1>
              </div>
              <span className="coordinator-count-badge font-['Orbitron']">{filteredEvents.length} AVAILABLE</span>
            </div>

            {/* Filter and Search Bar */}
            <div className="coordinator-filter-bar">
              <div className="coordinator-search-input-shell">
                <svg
                  className="w-4 h-4 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder="Filter events by title, venue, or location..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  className="coordinator-search-input"
                  aria-label="Filter events"
                />
              </div>

              <div className="coordinator-tabs" role="tablist">
                {['all', 'today', 'upcoming', 'past'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={eventFilter === tab}
                    className={`coordinator-tab ${eventFilter === tab ? 'active' : ''}`}
                    onClick={() => setEventFilter(tab)}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Events Loading State */}
            {loadingEvents && (
              <div className="coordinator-loading-grid" role="status" aria-label="Loading assigned events">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="coordinator-event-skeleton motion-safe:animate-pulse">
                    <div className="skeleton-title" />
                    <div className="skeleton-meta" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            )}

            {/* Events Load Error */}
            {!loadingEvents && eventsError && (
              <div className="coordinator-error-card" role="alert">
                <p>{eventsError}</p>
                <button type="button" className="coordinator-retry-btn" onClick={loadAssignedEvents}>
                  TRY AGAIN
                </button>
              </div>
            )}

            {/* Empty State */}
            {!loadingEvents && !eventsError && filteredEvents.length === 0 && (
              <div className="coordinator-empty-state">
                <svg
                  className="w-16 h-16 text-neutral-600 mb-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <h3>No Assigned Events Found</h3>
                <p>
                  {eventSearch || eventFilter !== 'all'
                    ? 'No events match your current filter criteria.'
                    : 'Your account does not currently have any active event assignments.'}
                </p>
                {(eventSearch || eventFilter !== 'all') && (
                  <button
                    type="button"
                    className="coordinator-clear-filter-btn"
                    onClick={() => {
                      setEventSearch('')
                      setEventFilter('all')
                    }}
                  >
                    CLEAR FILTERS
                  </button>
                )}
              </div>
            )}

            {/* Events Grid */}
            {!loadingEvents && !eventsError && filteredEvents.length > 0 && (
              <div className="coordinator-grid">
                {filteredEvents.map((evt) => {
                  const evtId = evt.eventId || evt.id
                  const dateObj = evt.eventDate ? new Date(evt.eventDate) : null
                  const formattedDate = dateObj
                    ? dateObj.toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Date TBA'
                  const formattedTime = dateObj
                    ? dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    : ''

                  return (
                    <article key={evtId} className="coordinator-card" onClick={() => handleSelectEvent(evt)}>
                      <div className="coordinator-card-top">
                        <span className="coordinator-card-badge font-['Orbitron']">EVENT #{evtId}</span>
                        <span className="coordinator-card-time font-['Orbitron']">{formattedTime || 'DOORS OPEN'}</span>
                      </div>

                      <h2 className="coordinator-card-title">{evt.title || 'Untitled Event'}</h2>

                      <div className="coordinator-card-meta">
                        <div className="coordinator-meta-row">
                          <svg
                            className="w-4 h-4 text-red-500 flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>{formattedDate}</span>
                        </div>
                        <div className="coordinator-meta-row">
                          <svg
                            className="w-4 h-4 text-red-500 flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>{evt.venue || evt.location || 'Venue Not Specified'}</span>
                        </div>
                      </div>

                      <div className="coordinator-card-footer">
                        <button
                          type="button"
                          className="coordinator-launch-btn font-['Orbitron']"
                          disabled={verifyingAccess}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectEvent(evt)
                          }}
                        >
                          {verifyingAccess ? 'VERIFYING...' : 'LAUNCH SCANNER →'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* VIEW B: QR SCANNER UI (For the selected event)                        */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {selectedEvent && (
          <div className="coordinator-scanner-view">
            {/* Active Event Banner & Switch Event Control */}
            <div className="coordinator-active-banner">
              <div className="coordinator-active-info">
                <button
                  type="button"
                  className="coordinator-switch-btn font-['Orbitron']"
                  onClick={() => {
                    setSelectedEvent(null)
                    setLastScanResult(null)
                  }}
                >
                  ← SWITCH EVENT
                </button>
                <div>
                  <h1 className="coordinator-active-title">{selectedEvent.title}</h1>
                  <p className="coordinator-active-sub">
                    Venue: <strong>{selectedEvent.venue || selectedEvent.location || 'Main Arena'}</strong> • Event #
                    {selectedEvent.eventId || selectedEvent.id}
                  </p>
                </div>
              </div>

              <div className="coordinator-live-counter">
                <span className="live-count-num font-['Orbitron']">{validScansCount}</span>
                <span className="live-count-label">CHECKED IN THIS SESSION</span>
              </div>
            </div>

            {/* Split Screen Grid: Scanner / Connect Widget & Results */}
            <div className="coordinator-scanner-layout">
              {/* Left Column: Web Desktop Manual Entry & Mobile QR Connect Animation OR Mobile Live Camera */}
              <div className="coordinator-scanner-column">
                {isMobile ? (
                  /* ── MOBILE VIEWPORT: Live Camera Viewfinder ── */
                  <div className="coordinator-viewfinder-shell">
                    <div className="coordinator-viewfinder">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className={`coordinator-video-stream ${cameraActive ? 'active' : 'hidden'}`}
                      />

                      {!cameraActive && (
                        <div className="coordinator-camera-placeholder">
                          <svg
                            className="w-16 h-16 text-red-500/60 mb-3 animate-pulse"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <span className="font-['Orbitron'] text-xs text-neutral-400">
                            {cameraError || 'STANDBY CAMERA SENSOR'}
                          </span>
                          <button
                            type="button"
                            className="coordinator-retry-cam-btn mt-3 font-['Orbitron']"
                            onClick={startCameraStream}
                          >
                            START CAMERA
                          </button>
                        </div>
                      )}

                      {/* HUD Reticle Overlay */}
                      <div className="coordinator-hud-overlay">
                        <div className="hud-corner top-left" />
                        <div className="hud-corner top-right" />
                        <div className="hud-corner bottom-left" />
                        <div className="hud-corner bottom-right" />
                        {/* Laser Sweeper */}
                        <div className="hud-laser-line" />
                        <div className="hud-target-box">
                          <span className="font-['Orbitron'] hud-target-text">ALIGN QR CODE</span>
                        </div>
                      </div>
                    </div>

                    {/* Camera Control Toolbar */}
                    <div className="coordinator-cam-toolbar">
                      <button
                        type="button"
                        className={`cam-tool-btn ${cameraActive ? 'active' : ''}`}
                        onClick={() => (cameraActive ? stopCameraStream() : startCameraStream())}
                        title={cameraActive ? 'Pause Camera' : 'Start Camera'}
                      >
                        {cameraActive ? 'PAUSE CAM' : 'RESUME CAM'}
                      </button>
                      <button
                        type="button"
                        className="cam-tool-btn"
                        onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                        title="Flip Camera Direction"
                      >
                        FLIP CAMERA
                      </button>
                      <button
                        type="button"
                        className={`cam-tool-btn ${torchOn ? 'active' : ''}`}
                        onClick={toggleTorch}
                        title="Toggle Flash / Torch"
                      >
                        TORCH: {torchOn ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── WEB / DESKTOP VIEWPORT: Animated Mobile Sync Terminal ── */
                  <div className="coordinator-desktop-sync-card">
                    <div className="desktop-sync-header">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-widest font-['Orbitron']">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        DESKTOP GATE TERMINAL
                      </div>
                      <span className="text-xs text-neutral-400 font-mono">LIVE SYNC READY</span>
                    </div>

                    {/* Animated Mobile Device Sync Visualizer */}
                    <div className="phone-connect-animation-shell">
                      <div className="phone-device-frame">
                        <div className="phone-notch" />
                        <div className="phone-screen">
                          <div className="phone-qr-scan-line" />
                          <div className="phone-qr-mock">
                            <div className="qr-corner qr-tl" />
                            <div className="qr-corner qr-tr" />
                            <div className="qr-corner qr-bl" />
                            <div className="qr-dot-grid" />
                          </div>
                          <span className="phone-scan-label font-['Orbitron']">SCANNER ACTIVE</span>
                        </div>
                      </div>

                      {/* Sync Wave Particle Stream */}
                      <div className="sync-wave-stream">
                        <div className="sync-wave-ring ring-1" />
                        <div className="sync-wave-ring ring-2" />
                        <div className="sync-wave-ring ring-3" />
                        <div className="sync-badge font-['Orbitron']">
                          <svg
                            className="w-3.5 h-3.5 text-emerald-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                            <circle cx="12" cy="20" r="1" fill="currentColor" />
                          </svg>
                          <span>MOBILE COMPANION CONNECTED</span>
                        </div>
                      </div>
                    </div>

                    <div className="desktop-sync-info-box">
                      <h3 className="desktop-sync-title font-['Orbitron']">Mobile QR Scanner & Web Gate Terminal</h3>
                      <p className="desktop-sync-desc">
                        Camera scanning is active on mobile devices. On this desktop terminal, enter or scan ticket
                        codes via handheld barcode/RFID reader or keyboard input below to validate gate access
                        instantly.
                      </p>
                    </div>
                  </div>
                )}

                {/* Manual Ticket Input Shell */}
                <div className="coordinator-manual-box">
                  <form onSubmit={handleManualSubmit} className="coordinator-manual-form">
                    <label htmlFor="manual-ticket-input" className="manual-input-label font-['Orbitron']">
                      MANUAL TICKET CODE ENTRY
                    </label>
                    <div className="manual-input-row">
                      <input
                        id="manual-ticket-input"
                        type="text"
                        placeholder="e.g. EXVO-TICK-9082 or scan value..."
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        className="coordinator-manual-input"
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <button
                        type="submit"
                        className="coordinator-manual-btn font-['Orbitron']"
                        disabled={!manualCode.trim() || scanning}
                      >
                        {scanning ? 'VERIFYING...' : 'CHECK IN'}
                      </button>
                    </div>
                  </form>

                  {/* Quick Simulation Bar for Fast Testing / Verification */}
                  <div className="coordinator-sim-bar">
                    <span className="sim-label font-['Orbitron']">DEMO SIMULATOR:</span>
                    <button
                      type="button"
                      className="sim-btn sim-btn--valid"
                      onClick={() => handleProcessScan(`EXVO-GA-${Math.floor(1000 + Math.random() * 9000)}`)}
                      disabled={scanning}
                    >
                      + VALID TICKET
                    </button>
                    <button
                      type="button"
                      className="sim-btn sim-btn--vip"
                      onClick={() => handleProcessScan(`EXVO-VIP-${Math.floor(1000 + Math.random() * 9000)}`)}
                      disabled={scanning}
                    >
                      + VIP PASS
                    </button>
                    <button
                      type="button"
                      className="sim-btn sim-btn--invalid"
                      onClick={() => handleProcessScan(`INVALID-${Math.floor(1000 + Math.random() * 9000)}`)}
                      disabled={scanning}
                    >
                      + INVALID CODE
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Scan Result & Live Session Log */}
              <div className="coordinator-results-column">
                {/* Result Card Modal/Badge */}
                {lastScanResult ? (
                  <div
                    className={`coordinator-result-card coordinator-result-card--${lastScanResult.status.toLowerCase()}`}
                    role="alert"
                  >
                    <div className="result-card-header">
                      <span className="result-status-badge font-['Orbitron']">
                        {lastScanResult.status === 'VALID'
                          ? '✓ ACCESS GRANTED'
                          : lastScanResult.status === 'DUPLICATE'
                            ? '⚠ ALREADY CHECKED IN'
                            : '✕ ACCESS DENIED'}
                      </span>
                      <span className="result-time font-['Orbitron']">
                        {new Date(lastScanResult.checkedInAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="result-card-body">
                      <div className="result-attendee font-['Orbitron']">{lastScanResult.attendeeName}</div>
                      <div className="result-meta-grid">
                        <div className="result-meta-item">
                          <span className="meta-label">TICKET CODE</span>
                          <span className="meta-value font-mono">{lastScanResult.ticketCode}</span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">PASS TIER</span>
                          <span className="meta-value">{lastScanResult.ticketType}</span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">SEAT ALLOCATION</span>
                          <span className="meta-value">{lastScanResult.seatCode}</span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">GATE STATUS</span>
                          <span className="meta-value">{lastScanResult.message}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="coordinator-idle-card">
                    <svg
                      className="w-12 h-12 text-neutral-600 mb-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                      <rect x="7" y="7" width="10" height="10" rx="1" />
                    </svg>
                    <span className="font-['Orbitron'] text-xs text-neutral-400">READY FOR NEXT SCAN</span>
                    <p className="text-neutral-500 text-xs mt-1">
                      Point camera at attendee QR badge or submit ticket code.
                    </p>
                  </div>
                )}

                {/* Live Session Scan History */}
                <div className="coordinator-history-shell">
                  <div className="coordinator-history-header">
                    <div>
                      <h3 className="history-heading font-['Orbitron']">Session Scan Log</h3>
                      <p className="history-sub">{scanHistory.length} Total Verification Attempts</p>
                    </div>
                    {scanHistory.length > 0 && (
                      <button
                        type="button"
                        className="history-clear-btn"
                        onClick={() => {
                          setScanHistory([])
                          setLastScanResult(null)
                        }}
                      >
                        CLEAR LOG
                      </button>
                    )}
                  </div>

                  {scanHistory.length > 0 && (
                    <div className="history-search-row">
                      <input
                        type="search"
                        placeholder="Search scan log..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="history-search-input"
                      />
                    </div>
                  )}

                  <div className="coordinator-history-list" role="log" aria-label="Recent Scans">
                    {filteredHistory.length === 0 ? (
                      <div className="history-empty text-center py-8 text-neutral-500 text-xs">
                        {scanHistory.length === 0 ? 'No scans in this session yet.' : 'No matching scans found.'}
                      </div>
                    ) : (
                      filteredHistory.map((item, idx) => (
                        <div
                          key={`${item.ticketCode}-${idx}`}
                          className={`history-item history-item--${item.status.toLowerCase()}`}
                        >
                          <div className="history-item-left">
                            <span className={`status-pill status-pill--${item.status.toLowerCase()} font-['Orbitron']`}>
                              {item.status}
                            </span>
                            <div>
                              <div className="history-attendee">{item.attendeeName}</div>
                              <div className="history-code font-mono">
                                {item.ticketCode} • {item.ticketType}
                              </div>
                            </div>
                          </div>
                          <div className="history-time font-['Orbitron']">
                            {new Date(item.checkedInAt).toLocaleTimeString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
