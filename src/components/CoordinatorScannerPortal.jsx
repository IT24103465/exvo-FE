import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as coordinatorService from '../services/coordinatorService'
import * as analyticsService from '../services/analyticsService'
import * as bookingService from '../services/bookingService'

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
    if (type === 'VALID' || type === 'CHECKED_IN') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
      osc.start(now)
      osc.stop(now + 0.25)
    } else if (type === 'DUPLICATE' || type === 'ALREADY_USED') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.setValueAtTime(330, now + 0.12)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
    } else if (type === 'WRONG_EVENT') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(350, now)
      osc.frequency.setValueAtTime(250, now + 0.15)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
    } else if (type === 'NOT_ELIGIBLE') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(300, now)
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.2)
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

// Helper to determine if an event date is today (ignoring time)
const isEventToday = (eventDate) => {
  if (!eventDate) return false
  const evtDate = new Date(eventDate)
  if (isNaN(evtDate.getTime())) return false
  const now = new Date()
  return (
    evtDate.getFullYear() === now.getFullYear() &&
    evtDate.getMonth() === now.getMonth() &&
    evtDate.getDate() === now.getDate()
  )
}

// Helper to determine if an event is past (before today, ignoring time)
const isEventPast = (eventDate) => {
  if (!eventDate) return false
  const evtDate = new Date(eventDate)
  if (isNaN(evtDate.getTime())) return false
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const evtStart = new Date(evtDate.getFullYear(), evtDate.getMonth(), evtDate.getDate()).getTime()
  return evtStart < todayStart
}

export default function CoordinatorScannerPortal({
  user,
  onBack,
  ExvoLogo,
  initialSelectedEvent = null,
  onNavigateAnalytics,
  onNavigateReports,
  onCheckInConfirmed,
}) {
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

  // SCRUM-36: Live Attendance & Occupancy Analytics state for active event
  const [liveAnalytics, setLiveAnalytics] = useState(null)

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
  const [confirmingCheckIn, setConfirmingCheckIn] = useState(false)

  // Validation Result
  const [lastScanResult, setLastScanResult] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [historySearch, setHistorySearch] = useState('')

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanIntervalRef = useRef(null)
  const handleProcessScanRef = useRef(null)

  // ── Load Assigned Events ──
  const loadAssignedEvents = useCallback(async () => {
    if (!isAuthorizedScanner) return
    setLoadingEvents(true)
    setEventsError(null)
    try {
      const data = await coordinatorService.getCoordinatorEvents()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      setEventsError(err.message || 'Failed to load assigned events.')
    } finally {
      setLoadingEvents(false)
    }
  }, [isAuthorizedScanner])

  // ── Fetch Live Analytics for Active Event (SCRUM-36) ──
  const fetchLiveEventAnalytics = useCallback(
    async (targetEventId) => {
      if (!targetEventId) {
        setLiveAnalytics(null)
        return
      }
      try {
        let data = await analyticsService.getEventAnalytics(targetEventId)
        if (!data && selectedEvent) {
          let liveAvailability = null
          try {
            liveAvailability = await bookingService.getEventAvailability(targetEventId)
          } catch {
            // ignore
          }
          data = analyticsService.calculateEventRealTimeAnalytics(selectedEvent, liveAvailability)
        }
        if (data) {
          setLiveAnalytics(data)
        }
      } catch {
        if (selectedEvent) {
          setLiveAnalytics(analyticsService.calculateEventRealTimeAnalytics(selectedEvent))
        }
      }
    },
    [selectedEvent],
  )

  useEffect(() => {
    if (selectedEvent) {
      const eventId = selectedEvent.eventId || selectedEvent.id
      fetchLiveEventAnalytics(eventId)

      // Auto-poll live telemetry every 15s to keep scanner telemetry up to date with real data
      const pollTimer = setInterval(() => {
        fetchLiveEventAnalytics(eventId)
      }, 15000)

      return () => clearInterval(pollTimer)
    } else {
      setLiveAnalytics(null)
    }
  }, [selectedEvent, fetchLiveEventAnalytics])

  useEffect(() => {
    if (isAuthorizedScanner) {
      loadAssignedEvents()
    }
  }, [isAuthorizedScanner, loadAssignedEvents])

  // ── Stop Camera Stream Helper ──
  const stopCameraStream = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
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

      // Start BarcodeDetector scan interval if supported
      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] })
          const intervalId = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState >= 2 && !scanning && !confirmingCheckIn) {
              try {
                const barcodes = await detector.detect(videoRef.current)
                if (barcodes.length > 0 && barcodes[0].rawValue && handleProcessScanRef.current) {
                  handleProcessScanRef.current(barcodes[0].rawValue)
                }
              } catch {
                // Ignore detection errors for single frames
              }
            }
          }, 450)
          scanIntervalRef.current = intervalId
        } catch {
          // BarcodeDetector initialization fallback
        }
      }
    } catch (err) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access or use manual code entry.'
          : 'Could not activate camera viewfinder. You can still use manual ticket entry.',
      )
      setCameraActive(false)
    }
  }, [isMobile, facingMode, stopCameraStream, scanning, confirmingCheckIn])

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
    // Only allow scanner launch on the day of the event
    if (!isEventToday(eventItem.eventDate)) {
      if (isEventPast(eventItem.eventDate)) {
        setAccessError('This event has already expired. Scanner cannot be launched for past events.')
      } else {
        const dateStr = eventItem.eventDate ? new Date(eventItem.eventDate).toLocaleDateString() : 'its scheduled date'
        setAccessError(`Scanner can only be launched on the day of the event (${dateStr}).`)
      }
      return
    }

    setVerifyingAccess(true)
    setAccessError(null)
    setLastScanResult(null)
    try {
      const eventId = eventItem.eventId || eventItem.id
      await coordinatorService.verifyCoordinatorAccess(eventId)
      setSelectedEvent(eventItem)
    } catch (err) {
      setAccessError(err.message || 'Access verification failed for this event.')
    } finally {
      setVerifyingAccess(false)
    }
  }

  // ── Process Ticket Code Verification (Validation without check-in) ──
  const handleProcessScan = async (codeToVerify) => {
    const code = String(codeToVerify || '').trim()
    if (!code || !selectedEvent || scanning || confirmingCheckIn) return

    setScanning(true)
    const eventId = selectedEvent.eventId || selectedEvent.id
    const eventName = selectedEvent.title || `Event #${eventId}`

    // Check for duplicate in current session scan history
    const existingScan = scanHistory.find(
      (item) =>
        item.ticketCode.toUpperCase() === code.toUpperCase() &&
        (item.status === 'VALID' || item.status === 'CHECKED_IN'),
    )

    if (existingScan) {
      const duplicateResult = {
        ticketId: existingScan.ticketId || code,
        ticketCode: code,
        eventId,
        eventName,
        isValid: false,
        status: 'ALREADY_USED',
        attendeeName: existingScan.attendeeName || 'Attendee',
        ticketType: existingScan.ticketType || 'Standard',
        seatCode: existingScan.seatCode || 'General',
        validatedAt: new Date().toISOString(),
        checkedInAt: existingScan.checkedInAt || existingScan.validatedAt || new Date().toISOString(),
        message: `Already checked in at ${new Date(existingScan.checkedInAt || existingScan.validatedAt || Date.now()).toLocaleTimeString()}`,
      }
      playFeedbackSound('ALREADY_USED')
      setLastScanResult(duplicateResult)
      setScanHistory((prev) => [duplicateResult, ...prev])
      setScanning(false)
      setManualCode('')
      return
    }

    try {
      let response
      if (typeof coordinatorService.validateTicket === 'function') {
        response = await coordinatorService.validateTicket(eventId, code)
      } else if (typeof coordinatorService.validateTicketCheckIn === 'function') {
        response = await coordinatorService.validateTicketCheckIn(eventId, code)
      }
      if (!response && typeof coordinatorService.validateTicketCheckIn === 'function') {
        response = await coordinatorService.validateTicketCheckIn(eventId, code)
      }

      const rawStatus = (response?.status || (response?.isValid ? 'VALID' : 'INVALID')).toUpperCase()
      const status = ['VALID', 'INVALID', 'WRONG_EVENT', 'ALREADY_USED', 'NOT_ELIGIBLE'].includes(rawStatus)
        ? rawStatus
        : response?.isValid
          ? 'VALID'
          : 'INVALID'
      const isSuccess = status === 'VALID'

      const result = {
        ticketId: response?.ticketId || response?.id || code,
        ticketCode: code,
        eventId: response?.eventId || eventId,
        eventName: response?.eventName || eventName,
        isValid: isSuccess,
        status,
        isCheckedIn: false,
        attendeeName: response?.attendeeName || 'Verified Guest',
        ticketType: response?.ticketType || (code.toUpperCase().includes('VIP') ? 'VIP Pass' : 'General Admission'),
        seatCode: response?.seatCode || (code.length > 8 ? `S-${code.slice(-3).toUpperCase()}` : 'General'),
        validatedAt: response?.validatedAt || new Date().toISOString(),
        checkedInAt: response?.checkedInAt || null,
        message:
          response?.message ||
          (isSuccess
            ? 'Ticket is valid. Ready for check-in.'
            : status === 'ALREADY_USED'
              ? 'Ticket has already been used for entry.'
              : status === 'WRONG_EVENT'
                ? 'Ticket is registered for a different event.'
                : status === 'NOT_ELIGIBLE'
                  ? 'Ticket is not eligible for entry at this gate.'
                  : 'Ticket verification rejected'),
      }

      playFeedbackSound(status)
      setLastScanResult(result)
      setScanHistory((prev) => [result, ...prev])
    } catch (err) {
      const failedResult = {
        ticketId: code,
        ticketCode: code,
        eventId,
        eventName,
        isValid: false,
        status: 'INVALID',
        isCheckedIn: false,
        attendeeName: 'Unknown',
        ticketType: 'Unknown',
        seatCode: 'None',
        validatedAt: new Date().toISOString(),
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
  handleProcessScanRef.current = handleProcessScan

  // ── Confirm Check-In for Valid Tickets (SCRUM-31 Requirement) ──
  const handleConfirmCheckIn = async (ticketItem) => {
    if (!ticketItem || !selectedEvent || confirmingCheckIn) return

    setConfirmingCheckIn(true)
    const eventId = selectedEvent.eventId || selectedEvent.id
    const code = ticketItem.ticketCode

    try {
      const checkInResponse = await coordinatorService.confirmTicketCheckIn(eventId, code)
      const checkedInTime = checkInResponse.checkedInAt || new Date().toISOString()

      const updatedResult = {
        ...ticketItem,
        isCheckedIn: true,
        checkedInAt: checkedInTime,
        message: checkInResponse.message || 'Check-in confirmed successfully!',
        checkInError: null,
      }

      playFeedbackSound('CHECKED_IN')
      setLastScanResult(updatedResult)
      setScanHistory((prev) =>
        prev.map((item) => (item.ticketCode === code && item.status === 'VALID' ? updatedResult : item)),
      )

      // SCRUM-36: Automatically refresh analytics after successful check-in
      fetchLiveEventAnalytics(eventId)
      if (typeof onCheckInConfirmed === 'function') {
        onCheckInConfirmed(eventId, updatedResult)
      }
    } catch (err) {
      setLastScanResult((prev) =>
        prev
          ? {
              ...prev,
              checkInError: err.message || 'Failed to confirm check-in. Please retry.',
            }
          : null,
      )
    } finally {
      setConfirmingCheckIn(false)
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
    return events.filter((evt) => {
      const title = (evt.title || '').toLowerCase()
      const venue = (evt.venue || '').toLowerCase()
      const loc = (evt.location || '').toLowerCase()
      const query = eventSearch.trim().toLowerCase()

      const matchesSearch = !query || title.includes(query) || venue.includes(query) || loc.includes(query)
      if (!matchesSearch) return false

      const isToday = isEventToday(evt.eventDate)
      const isPast = isEventPast(evt.eventDate)

      // Past/expired events only display in the 'past' category
      if (isPast) {
        return eventFilter === 'past'
      }

      // Non-past events
      if (eventFilter === 'past') return false
      if (eventFilter === 'today') return isToday
      if (eventFilter === 'upcoming') return !isPast && !isToday
      return true // 'all' tab shows active/today/upcoming events (expired events excluded)
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
  const checkedInCount = scanHistory.filter((s) => s.isCheckedIn).length
  const alreadyUsedScansCount = scanHistory.filter(
    (s) => s.status === 'ALREADY_USED' || s.status === 'DUPLICATE',
  ).length
  const wrongEventScansCount = scanHistory.filter((s) => s.status === 'WRONG_EVENT').length
  const notEligibleScansCount = scanHistory.filter((s) => s.status === 'NOT_ELIGIBLE').length
  const invalidScansCount = scanHistory.filter((s) => s.status === 'INVALID').length

  // Live attendance and venue occupancy calculations (SCRUM-36)
  const analyticsSold = Number(liveAnalytics?.totalTicketsSold || selectedEvent?.totalCapacity || 0)
  const analyticsCheckedIn = Math.max(Number(liveAnalytics?.checkedInAttendees || 0), checkedInCount)
  const analyticsRemaining =
    liveAnalytics?.remainingAttendees != null
      ? Math.max(0, Number(liveAnalytics.remainingAttendees) - checkedInCount)
      : Math.max(0, analyticsSold - analyticsCheckedIn)
  const analyticsRate = analyticsSold > 0 ? Number(((analyticsCheckedIn / analyticsSold) * 100).toFixed(1)) : 0
  const totalCapacity = Number(liveAnalytics?.totalCapacity || selectedEvent?.totalCapacity || 1)
  const venueOccupancyPercent =
    liveAnalytics?.venueOccupancyPercentage != null
      ? Number(liveAnalytics.venueOccupancyPercentage)
      : totalCapacity > 0
        ? Number(((analyticsCheckedIn / totalCapacity) * 100).toFixed(1))
        : 0

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
          {onNavigateAnalytics && (
            <button
              type="button"
              className="coordinator-nav-btn font-['Orbitron']"
              onClick={() => onNavigateAnalytics(selectedEvent ? selectedEvent.eventId || selectedEvent.id : null)}
              title="Open Real-time Attendance Analytics Dashboard"
            >
              <svg
                className="w-4 h-4 text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>LIVE DASHBOARD</span>
            </button>
          )}

          {onNavigateReports && (
            <button
              type="button"
              className="coordinator-nav-btn coordinator-nav-btn--reports font-['Orbitron']"
              onClick={() => onNavigateReports(selectedEvent ? selectedEvent.eventId || selectedEvent.id : null)}
              title="Open Sales & Attendance Reports"
            >
              <svg
                className="w-4 h-4 text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>REPORTS</span>
            </button>
          )}

          <div className="coordinator-user-pill">
            <span className="coordinator-status-dot" aria-hidden="true" />
            <span className="coordinator-user-name">{user?.fullName || user?.name || 'Organizer'}</span>
            <span className="coordinator-role-tag">{user?.role || 'ORGANIZER'}</span>
          </div>
          <button
            type="button"
            className="coordinator-sync-btn font-['Orbitron']"
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
            <span className="coordinator-stat-label">VALID TICKETS</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-cyan-400">{checkedInCount}</span>
            <span className="coordinator-stat-label">CONFIRMED CHECK-IN</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-amber-400">{alreadyUsedScansCount}</span>
            <span className="coordinator-stat-label">ALREADY USED</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-purple-400">{wrongEventScansCount}</span>
            <span className="coordinator-stat-label">WRONG EVENT</span>
          </div>
          <div className="coordinator-stat-box">
            <span className="coordinator-stat-num text-red-400">{invalidScansCount + notEligibleScansCount}</span>
            <span className="coordinator-stat-label">REJECTED / INELIGIBLE</span>
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
                  const isToday = isEventToday(evt.eventDate)
                  const isPast = isEventPast(evt.eventDate)
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
                    <article
                      key={evtId}
                      className={`coordinator-card ${!isToday ? 'coordinator-card--disabled' : ''}`}
                      onClick={() => handleSelectEvent(evt)}
                    >
                      <div className="coordinator-card-top">
                        <span className="coordinator-card-badge font-['Orbitron']">EVENT #{evtId}</span>
                        {isPast ? (
                          <span
                            className="coordinator-card-badge text-neutral-400 font-['Orbitron']"
                            style={{ borderColor: 'rgba(255,255,255,0.2)' }}
                          >
                            EXPIRED
                          </span>
                        ) : isToday ? (
                          <span className="coordinator-card-time font-['Orbitron']">
                            {formattedTime || 'DOORS OPEN'}
                          </span>
                        ) : (
                          <span
                            className="coordinator-card-badge text-amber-400 font-['Orbitron']"
                            style={{ borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}
                          >
                            UPCOMING
                          </span>
                        )}
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
                          {isToday && (
                            <span className="text-[10px] font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 font-['Orbitron']">
                              TODAY
                            </span>
                          )}
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
                        {(onNavigateAnalytics || onNavigateReports) && (
                          <div className="coordinator-card-aux-actions">
                            {onNavigateAnalytics && (
                              <button
                                type="button"
                                className="coordinator-card-action-btn font-['Orbitron']"
                                title="View Real-Time Analytics"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onNavigateAnalytics(evtId)
                                }}
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                >
                                  <line x1="18" y1="20" x2="18" y2="10" />
                                  <line x1="12" y1="20" x2="12" y2="4" />
                                  <line x1="6" y1="20" x2="6" y2="14" />
                                </svg>
                                <span>STATS</span>
                              </button>
                            )}
                            {onNavigateReports && (
                              <button
                                type="button"
                                className="coordinator-card-action-btn coordinator-card-action-btn--reports font-['Orbitron']"
                                title="Generate Reports"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onNavigateReports(evtId)
                                }}
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <span>REPORTS</span>
                              </button>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          className={`coordinator-launch-btn font-['Orbitron'] ${!isToday ? 'coordinator-launch-btn--locked' : ''}`}
                          disabled={verifyingAccess || !isToday}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSelectEvent(evt)
                          }}
                          title={
                            isPast
                              ? 'Event has expired. Cannot launch scanner.'
                              : !isToday
                                ? 'Scanner can only be launched on the event date.'
                                : 'Launch QR Ticket Scanner'
                          }
                        >
                          {verifyingAccess
                            ? 'VERIFYING...'
                            : isPast
                              ? 'EVENT EXPIRED'
                              : isToday
                                ? 'LAUNCH SCANNER →'
                                : 'LOCKED (TODAY ONLY)'}
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

            {/* Live Attendance & Venue Occupancy Telemetry HUD (SCRUM-36) */}
            <div className="coordinator-telemetry-hud" role="region" aria-label="Live Attendance Telemetry">
              <div className="coordinator-telemetry-grid">
                <div className="coordinator-telemetry-card">
                  <span className="coordinator-telemetry-label font-['Orbitron']">TOTAL SOLD</span>
                  <span className="coordinator-telemetry-value text-white font-['Orbitron']">
                    {analyticsSold.toLocaleString()}
                  </span>
                  <span className="coordinator-telemetry-sub">Total passes sold</span>
                </div>

                <div className="coordinator-telemetry-card">
                  <span className="coordinator-telemetry-label font-['Orbitron']">CHECKED-IN</span>
                  <span className="coordinator-telemetry-value text-emerald-400 font-['Orbitron']">
                    {analyticsCheckedIn.toLocaleString()}
                  </span>
                  <span className="coordinator-telemetry-sub">
                    {checkedInCount > 0 ? `+${checkedInCount} verified now` : 'Total entries'}
                  </span>
                </div>

                <div className="coordinator-telemetry-card">
                  <span className="coordinator-telemetry-label font-['Orbitron']">REMAINING</span>
                  <span className="coordinator-telemetry-value text-cyan-400 font-['Orbitron']">
                    {analyticsRemaining.toLocaleString()}
                  </span>
                  <span className="coordinator-telemetry-sub">Expected arrivals</span>
                </div>

                <div className="coordinator-telemetry-card">
                  <span className="coordinator-telemetry-label font-['Orbitron']">CHECK-IN RATE</span>
                  <span className="coordinator-telemetry-value text-amber-400 font-['Orbitron']">{analyticsRate}%</span>
                  <div className="coordinator-telemetry-bar-wrap">
                    <div
                      className="coordinator-telemetry-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, analyticsRate))}%`, backgroundColor: '#f59e0b' }}
                    />
                  </div>
                </div>

                <div className="coordinator-telemetry-card">
                  <span className="coordinator-telemetry-label font-['Orbitron']">VENUE OCCUPANCY</span>
                  <span className="coordinator-telemetry-value text-purple-400 font-['Orbitron']">
                    {venueOccupancyPercent}%
                  </span>
                  <div className="coordinator-telemetry-bar-wrap">
                    <div
                      className="coordinator-telemetry-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, venueOccupancyPercent))}%`,
                        backgroundColor: venueOccupancyPercent > 90 ? '#ef4444' : '#a855f7',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Reciprocal Navigation Shortcuts */}
              <div className="coordinator-telemetry-actions">
                {onNavigateAnalytics && (
                  <button
                    type="button"
                    className="coordinator-telemetry-link font-['Orbitron']"
                    onClick={() => onNavigateAnalytics(selectedEvent.eventId || selectedEvent.id)}
                  >
                    FULL ATTENDANCE DASHBOARD →
                  </button>
                )}
                {onNavigateReports && (
                  <button
                    type="button"
                    className="coordinator-telemetry-link coordinator-telemetry-link--reports font-['Orbitron']"
                    onClick={() => onNavigateReports(selectedEvent.eventId || selectedEvent.id)}
                  >
                    GENERATE REPORTS →
                  </button>
                )}
              </div>
            </div>

            {/* Split Screen Grid: Scanner / Connect Widget & Results */}
            <div className="coordinator-scanner-layout">
              {/* Left Column: Web Desktop Manual Entry & Mobile QR Connect Animation OR Mobile Live Camera */}
              <div className="coordinator-scanner-column">
                {/* Manual Ticket Input Shell (at the top) */}
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
                        aria-label="VALIDATE / CHECK IN"
                      >
                        {scanning ? 'VALIDATING...' : 'VALIDATE / CHECK IN'}
                      </button>
                    </div>
                  </form>
                </div>

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
                        codes via handheld barcode/RFID reader or keyboard input above to validate gate access
                        instantly.
                      </p>
                    </div>
                  </div>
                )}
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
                          ? '✓ ACCESS GRANTED (VALID)'
                          : lastScanResult.status === 'ALREADY_USED' || lastScanResult.status === 'DUPLICATE'
                            ? '⚠ ALREADY CHECKED IN (ALREADY_USED)'
                            : lastScanResult.status === 'WRONG_EVENT'
                              ? '⊘ WRONG_EVENT'
                              : lastScanResult.status === 'NOT_ELIGIBLE'
                                ? '⛔ NOT_ELIGIBLE'
                                : '✕ ACCESS DENIED (INVALID)'}
                      </span>
                      <span className="result-time font-['Orbitron']">
                        {new Date(lastScanResult.validatedAt || lastScanResult.checkedInAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="result-card-body">
                      <div className="result-attendee font-['Orbitron']">{lastScanResult.attendeeName}</div>
                      <div className="result-meta-grid">
                        <div className="result-meta-item">
                          <span className="meta-label">TICKET ID</span>
                          <span className="meta-value font-mono">
                            {lastScanResult.ticketId || lastScanResult.ticketCode}
                          </span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">EVENT NAME</span>
                          <span className="meta-value">
                            {lastScanResult.eventName || selectedEvent?.title || 'Current Event'}
                          </span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">TICKET TYPE</span>
                          <span className="meta-value">{lastScanResult.ticketType}</span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">VALIDATION STATUS</span>
                          <span className="meta-value font-['Orbitron'] font-bold text-emerald-400">
                            {lastScanResult.status}
                          </span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">SEAT ALLOCATION</span>
                          <span className="meta-value">{lastScanResult.seatCode}</span>
                        </div>
                        <div className="result-meta-item">
                          <span className="meta-label">GATE MESSAGE</span>
                          <span className="meta-value">{lastScanResult.message}</span>
                        </div>
                      </div>

                      {/* Separate Confirm Check-In Button for VALID Tickets (SCRUM-31 Requirement) */}
                      {lastScanResult.status === 'VALID' && !lastScanResult.isCheckedIn && (
                        <div className="coordinator-action-container mt-3">
                          <button
                            type="button"
                            className="coordinator-confirm-btn font-['Orbitron']"
                            disabled={confirmingCheckIn}
                            onClick={() => handleConfirmCheckIn(lastScanResult)}
                          >
                            {confirmingCheckIn ? (
                              'CONFIRMING CHECK-IN...'
                            ) : (
                              <>
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                CONFIRM CHECK-IN
                              </>
                            )}
                          </button>
                          {lastScanResult.checkInError && (
                            <div className="text-red-400 text-xs mt-2 text-center" role="alert">
                              {lastScanResult.checkInError}
                              <button
                                type="button"
                                className="underline ml-2 text-white font-bold cursor-pointer"
                                onClick={() => handleConfirmCheckIn(lastScanResult)}
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Checked In Confirmation Banner */}
                      {lastScanResult.isCheckedIn && (
                        <div className="coordinator-checked-in-banner font-['Orbitron']">
                          <svg
                            className="w-4 h-4 text-emerald-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>CHECK-IN CONFIRMED ({new Date(lastScanResult.checkedInAt).toLocaleTimeString()})</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

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
                            {new Date(item.validatedAt || item.checkedInAt || Date.now()).toLocaleTimeString()}
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
