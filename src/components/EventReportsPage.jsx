import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getEventAnalytics,
  getEventReport,
  downloadReportFile,
  calculateEventRealTimeAnalytics,
  calculateAggregateRealTimeAnalytics,
} from '../services/analyticsService'
import { getMyEvents } from '../services/eventService'
import { getEventAvailability } from '../services/bookingService'

// Format currency in LKR with comma separators
const formatLKR = (amount) => {
  const num = Number(amount) || 0
  return `LKR ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function EventReportsPage({
  user,
  onBack,
  onNavigateAnalytics = null,
  onLaunchScanner = null,
  ExvoLogo,
  initialSelectedEventId = null,
}) {
  // ── Role-Based Access Control (RBAC) ──
  const isAuthorized = Boolean(user && (user.role === 'Organizer' || user.role === 'Company' || user.role === 'Admin'))

  // ── State Management ──
  const [organizerEvents, setOrganizerEvents] = useState([])
  const [selectedEventId, setSelectedEventId] = useState(
    initialSelectedEventId ? String(initialSelectedEventId) : 'all',
  )
  const [reportType, setReportType] = useState('sales') // 'sales' | 'attendance' | 'comprehensive'
  const [timeframe, setTimeframe] = useState('all') // 'all' | '30d' | '7d' | '24h'
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exportingFormat, setExportingFormat] = useState(null) // 'csv' | 'pdf' | null
  const [error, setError] = useState(null)
  const [exportNotice, setExportNotice] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [documentId, setDocumentId] = useState(null)

  // ── Load Organizer Events ──
  const loadOrganizerEvents = useCallback(async () => {
    if (!isAuthorized) return
    try {
      const data = await getMyEvents()
      if (Array.isArray(data)) {
        setOrganizerEvents(data)
      }
    } catch {
      // ignore
    }
  }, [isAuthorized])

  useEffect(() => {
    if (isAuthorized) {
      loadOrganizerEvents()
    }
  }, [isAuthorized, loadOrganizerEvents])

  // ── Generate Report with Fresh Real-Time Data ──
  const handleGenerateReport = useCallback(
    async (targetEventId = selectedEventId, currentReportType = reportType) => {
      if (!isAuthorized) return
      setLoading(true)
      setError(null)
      setExportNotice(null)

      try {
        const targetId = targetEventId === 'all' ? null : targetEventId
        let data = null

        // 1. Attempt to fetch dedicated report endpoint from backend API
        try {
          data = await getEventReport(targetId, currentReportType)
        } catch (apiErr) {
          console.warn('Backend report endpoint not reached, compiling from live catalog & analytics:', apiErr)
        }

        // 2. Fall back to live analytics calculation engine if report endpoint returns null
        if (!data) {
          try {
            data = await getEventAnalytics(targetId)
          } catch {
            // ignore
          }
        }

        if (!data) {
          if (targetId) {
            const selectedEvt = organizerEvents.find((e) => String(e.id || e.eventId) === String(targetId))
            if (selectedEvt) {
              let liveAvailability = null
              try {
                liveAvailability = await getEventAvailability(targetId)
              } catch {
                // ignore
              }
              data = calculateEventRealTimeAnalytics(selectedEvt, liveAvailability)
            }
          } else if (organizerEvents.length > 0) {
            const availabilitiesById = {}
            await Promise.allSettled(
              organizerEvents.map(async (evt) => {
                const evtId = evt.id || evt.eventId
                if (evtId) {
                  try {
                    const avail = await getEventAvailability(evtId)
                    if (avail) availabilitiesById[String(evtId)] = avail
                  } catch {
                    // ignore
                  }
                }
              }),
            )
            data = calculateAggregateRealTimeAnalytics(organizerEvents, availabilitiesById)
          }
        }

        if (data) {
          // Normalize metrics to guarantee all SCRUM-36/37 fields exist
          const sold = Number(data.totalTicketsSold || 0)
          const capacity = Number(data.totalCapacity || 1)
          const checkedIn = Number(data.checkedInAttendees || 0)
          const remaining = data.remainingAttendees != null ? Number(data.remainingAttendees) : Math.max(0, sold - checkedIn)
          const checkInRate =
            data.checkInRate != null
              ? Number(data.checkInRate)
              : sold > 0
                ? Number(((checkedIn / sold) * 100).toFixed(1))
                : 0
          const venueOccupancyPercent =
            data.venueOccupancyPercentage != null
              ? Number(data.venueOccupancyPercentage)
              : capacity > 0
                ? Number(((checkedIn / capacity) * 100).toFixed(1))
                : 0
          const fillRate =
            data.salesFillRate != null
              ? Number(data.salesFillRate)
              : capacity > 0
                ? Number(((sold / capacity) * 100).toFixed(1))
                : 0

          const normalized = {
            ...data,
            totalTicketsSold: sold,
            totalCapacity: capacity,
            checkedInAttendees: checkedIn,
            remainingAttendees: remaining,
            checkInRate,
            attendancePercentage: checkInRate,
            venueOccupancy: checkedIn,
            venueOccupancyPercentage: venueOccupancyPercent,
            salesFillRate: fillRate,
          }

          setReportData(normalized)
          setGeneratedAt(new Date())
          setDocumentId(`EXVO-REP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`)
        } else {
          setReportData(null)
        }
      } catch (err) {
        setError(err.message || 'Failed to generate report. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [isAuthorized, selectedEventId, reportType, organizerEvents],
  )

  // Generate on initial load or event selection change once events are loaded
  useEffect(() => {
    if (isAuthorized) {
      handleGenerateReport(selectedEventId, reportType)
    }
  }, [isAuthorized, selectedEventId, reportType, handleGenerateReport])

  // Handle Export / Download
  const handleExport = async (format) => {
    if (!reportData) return
    setExportingFormat(format)
    setError(null)
    setExportNotice(null)

    try {
      const result = await downloadReportFile(selectedEventId, reportType, format, reportData)
      setExportNotice({
        type: 'success',
        message:
          format === 'pdf' && result?.source === 'client-print'
            ? 'Print preview window opened. Choose "Save as PDF" to complete download.'
            : `Report successfully generated and downloaded as ${format.toUpperCase()} (${result?.filename || 'report'}).`,
      })
    } catch (err) {
      setError(err.message || `Failed to download ${format.toUpperCase()} report.`)
    } finally {
      setExportingFormat(null)
    }
  }

  // Active event title
  const currentEventTitle = useMemo(() => {
    if (selectedEventId === 'all') return 'All Managed Events (Executive Summary)'
    const match = organizerEvents.find((e) => String(e.id || e.eventId) === String(selectedEventId))
    return match ? match.title : 'Selected Event'
  }, [selectedEventId, organizerEvents])

  // ── Render RBAC Barrier if Unauthorized ──
  if (!isAuthorized) {
    return (
      <main className="coordinator-portal-page" role="main" aria-label="Organizer Reports Access">
        <div className="coordinator-bg-glow" />
        <section className="coordinator-shell">
          <div className="coordinator-rbac-card">
            <div className="coordinator-rbac-icon">
              <svg
                className="w-12 h-12 text-red-500"
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
              The Event Sales & Attendance Reports page is strictly restricted to verified <strong>Event Organizers</strong> and
              administrators. Your account role (<code>{user?.role || 'Guest'}</code>) is not authorized to generate
              or export official financial and attendance audit documents.
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

  return (
    <main className="reports-portal-page" role="main" aria-label="Sales and Attendance Reports Page">
      <div className="analytics-bg-glow" />

      {/* Header */}
      <header className="analytics-header">
        <div className="analytics-header-left">
          <button type="button" className="analytics-back-btn" onClick={onBack} title="Return to Portal">
            <span aria-hidden="true">←</span>
            <span>BACK</span>
          </button>
          <div className="analytics-brand">
            {ExvoLogo && <ExvoLogo />}
            <span className="font-['Orbitron'] font-black text-xl tracking-wider text-white">
              <span className="text-[#FF0000]">EX</span>VO
            </span>
            <span className="analytics-badge font-['Orbitron']">SALES & ATTENDANCE REPORTS</span>
          </div>
        </div>

        <div className="analytics-header-right">
          {onNavigateAnalytics && (
            <button
              type="button"
              className="reports-nav-btn"
              onClick={() => onNavigateAnalytics(selectedEventId === 'all' ? null : selectedEventId)}
              title="Switch to Real-time Analytics Dashboard"
            >
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>LIVE DASHBOARD</span>
            </button>
          )}

          {onLaunchScanner && (
            <button
              type="button"
              className="reports-nav-btn reports-nav-btn--scanner"
              onClick={() => onLaunchScanner(selectedEventId === 'all' ? null : selectedEventId)}
              title="Switch to QR Ticket Scanner Portal"
            >
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01" />
                <path d="M12 7v10" />
              </svg>
              <span>SCANNER</span>
            </button>
          )}

          <div className="analytics-user-pill">
            <span className="analytics-user-name">{user?.fullName || user?.name || 'Organizer'}</span>
            <span className="analytics-role-tag">{user?.role || 'ORGANIZER'}</span>
          </div>
        </div>
      </header>

      <section className="analytics-shell">
        {/* Reports Controls Bar: Event Selection, Report Type, Timeframe & Generate Button */}
        <div className="reports-control-panel">
          <div className="reports-control-grid">
            {/* Event Selector */}
            <div className="reports-control-group">
              <label htmlFor="report-event-select" className="reports-control-label font-['Orbitron']">
                SELECT EVENT
              </label>
              <select
                id="report-event-select"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="reports-control-select font-['Orbitron']"
                aria-label="Select Event for Report"
              >
                <option value="all">⚡ All Managed Events (Overview)</option>
                {organizerEvents.map((evt) => (
                  <option key={evt.id || evt.eventId} value={evt.id || evt.eventId}>
                    {evt.title} ({evt.venue || 'Sri Lanka'})
                  </option>
                ))}
              </select>
            </div>

            {/* Report Type Selector */}
            <div className="reports-control-group">
              <label htmlFor="report-type-select" className="reports-control-label font-['Orbitron']">
                REPORT TYPE
              </label>
              <select
                id="report-type-select"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="reports-control-select font-['Orbitron']"
                aria-label="Select Report Type"
              >
                <option value="sales">🎫 Sales & Revenue Report</option>
                <option value="attendance">👥 Attendance & Check-In Report</option>
                <option value="comprehensive">📊 Comprehensive Audit Report</option>
              </select>
            </div>

            {/* Timeframe Filter */}
            <div className="reports-control-group">
              <label htmlFor="report-timeframe-select" className="reports-control-label font-['Orbitron']">
                TIMEFRAME
              </label>
              <select
                id="report-timeframe-select"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="reports-control-select font-['Orbitron']"
                aria-label="Select Report Timeframe"
              >
                <option value="all">All-Time Cumulative</option>
                <option value="30d">Last 30 Days</option>
                <option value="7d">Last 7 Days</option>
                <option value="24h">Last 24 Hours</option>
              </select>
            </div>

            {/* Generate Report Button */}
            <div className="reports-control-actions">
              <button
                type="button"
                id="generate-report-btn"
                className="reports-generate-btn font-['Orbitron']"
                onClick={() => handleGenerateReport(selectedEventId, reportType)}
                disabled={loading}
              >
                <svg
                  className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{loading ? 'GENERATING...' : 'GENERATE REPORT'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Notices & Alerts */}
        {error && (
          <div className="analytics-alert analytics-alert--error" role="alert">
            <svg className="w-5 h-5 flex-shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
            <button type="button" onClick={() => handleGenerateReport(selectedEventId, reportType)} className="analytics-alert-retry">
              Retry
            </button>
          </div>
        )}

        {exportNotice && (
          <div className="reports-notice-banner" role="status">
            <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{exportNotice.message}</span>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="analytics-loading-state" role="status">
            <div className="analytics-spinner" />
            <span className="font-['Orbitron'] text-sm tracking-wider text-neutral-300">
              COMPILING AUDIT METRICS & GENERATING REPORT PREVIEW...
            </span>
          </div>
        ) : reportData ? (
          /* Report Document Preview Interface */
          <div className="report-preview-container" role="region" aria-label="Official Report Preview">
            {/* Download & Export Toolbar */}
            <div className="report-preview-toolbar">
              <div className="report-preview-toolbar-meta">
                <span className="report-doc-badge font-['Orbitron']">{documentId || 'EXVO-REP-OFFICIAL'}</span>
                <span className="text-xs text-neutral-400">
                  Generated: {generatedAt ? generatedAt.toLocaleString() : 'Just now'}
                </span>
              </div>

              <div className="report-export-buttons">
                <button
                  type="button"
                  id="download-csv-btn"
                  className="report-export-btn report-export-btn--csv font-['Orbitron']"
                  onClick={() => handleExport('csv')}
                  disabled={exportingFormat !== null}
                  title="Export raw tabular data in CSV format"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{exportingFormat === 'csv' ? 'EXPORTING...' : 'DOWNLOAD CSV'}</span>
                </button>

                <button
                  type="button"
                  id="download-pdf-btn"
                  className="report-export-btn report-export-btn--pdf font-['Orbitron']"
                  onClick={() => handleExport('pdf')}
                  disabled={exportingFormat !== null}
                  title="Print or save official report as PDF document"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span>{exportingFormat === 'pdf' ? 'PREPARING...' : 'DOWNLOAD PDF'}</span>
                </button>
              </div>
            </div>

            {/* Official Report Document Body */}
            <article className="report-document-sheet" id="printable-report-document">
              {/* Header with EXVO seal & metadata */}
              <div className="report-doc-header">
                <div className="report-doc-header-left">
                  <div className="report-doc-brand">
                    <span className="font-['Orbitron'] font-black text-2xl tracking-wider text-white">
                      <span className="text-[#FF0000]">EX</span>VO
                    </span>
                    <span className="report-doc-official-tag font-['Orbitron']">OFFICIAL EVENT AUDIT</span>
                  </div>
                  <h1 className="report-doc-title font-['Orbitron']">
                    {reportType === 'sales'
                      ? 'TICKET SALES & FINANCIAL REPORT'
                      : reportType === 'attendance'
                        ? 'ATTENDANCE & GATE CHECK-IN AUDIT'
                        : 'COMPREHENSIVE EVENT PERFORMANCE REPORT'}
                  </h1>
                  <p className="report-doc-subtitle">
                    Event: <strong>{currentEventTitle}</strong> | Venue: <strong>{reportData.venue || 'All Venues'}</strong>
                  </p>
                </div>

                <div className="report-doc-header-meta">
                  <div className="report-meta-row">
                    <span className="report-meta-label">DOCUMENT REF:</span>
                    <span className="report-meta-val font-mono font-bold text-red-400">{documentId}</span>
                  </div>
                  <div className="report-meta-row">
                    <span className="report-meta-label">ORGANIZER:</span>
                    <span className="report-meta-val">{user?.fullName || user?.name || 'Authorized Organizer'}</span>
                  </div>
                  <div className="report-meta-row">
                    <span className="report-meta-label">AUDIT DATE:</span>
                    <span className="report-meta-val">{generatedAt ? generatedAt.toLocaleDateString() : 'Today'}</span>
                  </div>
                  <div className="report-meta-row">
                    <span className="report-meta-label">TIMEFRAME:</span>
                    <span className="report-meta-val uppercase">{timeframe}</span>
                  </div>
                </div>
              </div>

              {/* Executive Summary Metrics Grid */}
              <div className="report-summary-kpis">
                {(reportType === 'sales' || reportType === 'comprehensive') && (
                  <>
                    <div className="report-kpi-card">
                      <span className="report-kpi-title">TOTAL TICKETS SOLD</span>
                      <span className="report-kpi-value font-['Orbitron'] text-blue-400">
                        {reportData.totalTicketsSold.toLocaleString()}
                      </span>
                      <span className="report-kpi-sub">
                        {reportData.salesFillRate || 0}% of capacity ({reportData.totalCapacity.toLocaleString()})
                      </span>
                    </div>

                    <div className="report-kpi-card">
                      <span className="report-kpi-title">GROSS REVENUE (LKR)</span>
                      <span className="report-kpi-value font-['Orbitron'] text-emerald-400">
                        {formatLKR(reportData.totalRevenue)}
                      </span>
                      <span className="report-kpi-sub">Total ticket sales value</span>
                    </div>

                    <div className="report-kpi-card">
                      <span className="report-kpi-title">AVAILABLE TICKETS</span>
                      <span className="report-kpi-value font-['Orbitron'] text-amber-300">
                        {(reportData.availableTickets || 0).toLocaleString()}
                      </span>
                      <span className="report-kpi-sub">Remaining unsold passes</span>
                    </div>
                  </>
                )}

                {(reportType === 'attendance' || reportType === 'comprehensive') && (
                  <>
                    <div className="report-kpi-card">
                      <span className="report-kpi-title">CHECKED-IN ATTENDEES</span>
                      <span className="report-kpi-value font-['Orbitron'] text-purple-400">
                        {reportData.checkedInAttendees.toLocaleString()}
                      </span>
                      <span className="report-kpi-sub">Gate verified via scanner</span>
                    </div>

                    <div className="report-kpi-card">
                      <span className="report-kpi-title">REMAINING EXPECTED</span>
                      <span className="report-kpi-value font-['Orbitron'] text-amber-400">
                        {reportData.remainingAttendees.toLocaleString()}
                      </span>
                      <span className="report-kpi-sub">Pass holders pending entry</span>
                    </div>

                    <div className="report-kpi-card">
                      <span className="report-kpi-title">CHECK-IN RATE</span>
                      <span className="report-kpi-value font-['Orbitron'] text-red-400">
                        {reportData.checkInRate}%
                      </span>
                      <span className="report-kpi-sub">Turnout percentage</span>
                    </div>

                    <div className="report-kpi-card">
                      <span className="report-kpi-title">VENUE OCCUPANCY</span>
                      <span className="report-kpi-value font-['Orbitron'] text-cyan-400">
                        {reportData.venueOccupancyPercentage}%
                      </span>
                      <span className="report-kpi-sub">Capacity currently inside</span>
                    </div>
                  </>
                )}
              </div>

              {/* Visual Performance Progress Meters */}
              <div className="report-progress-section">
                <h3 className="report-section-heading font-['Orbitron']">CAPACITY & PERFORMANCE GAUGES</h3>
                <div className="report-meters-grid">
                  <div className="report-meter-box">
                    <div className="report-meter-info">
                      <span className="report-meter-label font-['Orbitron']">GATE CHECK-IN COMPLETION</span>
                      <span className="report-meter-pct font-bold text-purple-300">{reportData.checkInRate}%</span>
                    </div>
                    <div className="report-progress-track">
                      <div
                        className="report-progress-fill report-progress-fill--attendance"
                        style={{ width: `${Math.min(reportData.checkInRate, 100)}%` }}
                      />
                    </div>
                    <span className="report-meter-detail">
                      {reportData.checkedInAttendees} verified out of {reportData.totalTicketsSold} tickets sold
                    </span>
                  </div>

                  <div className="report-meter-box">
                    <div className="report-meter-info">
                      <span className="report-meter-label font-['Orbitron']">VENUE OCCUPANCY RATE</span>
                      <span className="report-meter-pct font-bold text-cyan-300">{reportData.venueOccupancyPercentage}%</span>
                    </div>
                    <div className="report-progress-track">
                      <div
                        className="report-progress-fill report-progress-fill--occupancy"
                        style={{ width: `${Math.min(reportData.venueOccupancyPercentage, 100)}%` }}
                      />
                    </div>
                    <span className="report-meter-detail">
                      {reportData.checkedInAttendees} inside venue out of {reportData.totalCapacity} total capacity
                    </span>
                  </div>

                  <div className="report-meter-box">
                    <div className="report-meter-info">
                      <span className="report-meter-label font-['Orbitron']">INVENTORY SALES FILL RATE</span>
                      <span className="report-meter-pct font-bold text-emerald-300">{reportData.salesFillRate}%</span>
                    </div>
                    <div className="report-progress-track">
                      <div
                        className="report-progress-fill report-progress-fill--sales"
                        style={{ width: `${Math.min(reportData.salesFillRate, 100)}%` }}
                      />
                    </div>
                    <span className="report-meter-detail">
                      {reportData.totalTicketsSold} passes sold out of {reportData.totalCapacity} capacity
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown Tables */}
              {(reportType === 'sales' || reportType === 'comprehensive') && reportData.ticketTiers?.length > 0 && (
                <div className="report-table-section">
                  <h3 className="report-section-heading font-['Orbitron']">TICKET TIER SALES AUDIT TABLE</h3>
                  <div className="analytics-table-responsive">
                    <table className="analytics-data-table">
                      <thead>
                        <tr>
                          <th>TIER / CATEGORY</th>
                          <th>UNIT PRICE</th>
                          <th>CAPACITY</th>
                          <th>TICKETS SOLD</th>
                          <th>AVAILABLE</th>
                          <th>FILL RATE</th>
                          <th>SUBTOTAL REVENUE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.ticketTiers.map((tier, idx) => {
                          const tierFill = tier.capacity > 0 ? Math.round((tier.sold / tier.capacity) * 100) : 0
                          return (
                            <tr key={tier.name || idx}>
                              <td className="font-bold text-white font-['Orbitron']">{tier.name}</td>
                              <td className="text-emerald-400 font-mono">{formatLKR(tier.price)}</td>
                              <td className="text-neutral-400">{tier.capacity || 'Unlimited'}</td>
                              <td className="font-bold text-white">{tier.sold}</td>
                              <td className="text-amber-300">{tier.available}</td>
                              <td>{tierFill}%</td>
                              <td className="font-bold text-emerald-400 font-mono">{formatLKR(tier.revenue)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Attendance Hourly Velocity Breakdown */}
              {(reportType === 'attendance' || reportType === 'comprehensive') &&
                reportData.hourlyAttendance?.length > 0 && (
                  <div className="report-table-section">
                    <h3 className="report-section-heading font-['Orbitron']">HOURLY GATE CHECK-IN VELOCITY LOG</h3>
                    <div className="analytics-table-responsive">
                      <table className="analytics-data-table">
                        <thead>
                          <tr>
                            <th>TIME WINDOW</th>
                            <th>CHECKED-IN COUNT</th>
                            <th>SHARE OF TOTAL CHECK-INS</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.hourlyAttendance.map((slot, idx) => {
                            const share =
                              reportData.checkedInAttendees > 0
                                ? Math.round((slot.count / reportData.checkedInAttendees) * 100)
                                : 0
                            return (
                              <tr key={slot.time || idx}>
                                <td className="font-bold text-white font-['Orbitron']">{slot.time}</td>
                                <td className="font-bold text-purple-300 font-mono">{slot.count}</td>
                                <td>{share}%</td>
                                <td>
                                  <span className="report-status-badge report-status-badge--active">VERIFIED</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Multi-Event Breakdown (when viewing all events) */}
              {selectedEventId === 'all' && reportData.eventsBreakdown?.length > 0 && (
                <div className="report-table-section">
                  <h3 className="report-section-heading font-['Orbitron']">ALL MANAGED EVENTS COMPARATIVE AUDIT</h3>
                  <div className="analytics-table-responsive">
                    <table className="analytics-data-table">
                      <thead>
                        <tr>
                          <th>EVENT TITLE</th>
                          <th>VENUE</th>
                          <th>SOLD</th>
                          <th>AVAILABLE</th>
                          <th>CHECKED IN</th>
                          <th>REMAINING</th>
                          <th>CHECK-IN RATE</th>
                          <th>EST. REVENUE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.eventsBreakdown.map((ev) => (
                          <tr key={ev.id}>
                            <td className="font-bold text-white font-['Orbitron']">{ev.title}</td>
                            <td className="text-neutral-400">{ev.venue || 'Sri Lanka'}</td>
                            <td className="font-bold text-white">{ev.ticketsSold}</td>
                            <td className="text-amber-300">{ev.available}</td>
                            <td className="font-bold text-purple-300">{ev.checkedIn}</td>
                            <td className="text-amber-400">{ev.remaining || 0}</td>
                            <td className="text-emerald-400 font-bold">{ev.checkInRate || 0}%</td>
                            <td className="font-bold text-emerald-400 font-mono">{formatLKR(ev.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Official Document Footer */}
              <div className="report-doc-footer">
                <div className="report-doc-footer-left">
                  <span>EXVO Event Management Platform</span>
                  <span>Confidential Organizer Audit Document</span>
                </div>
                <div className="report-doc-footer-right">
                  <span>Authenticated via JWT Authorization</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            </article>
          </div>
        ) : (
          <div className="analytics-empty-state" role="region" aria-label="No Report Data">
            <div className="analytics-empty-icon">
              <svg className="w-12 h-12 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="12" y1="8" x2="12" y2="16" />
              </svg>
            </div>
            <h2 className="analytics-empty-title font-['Orbitron']">NO EVENTS FOR REPORT GENERATION</h2>
            <p className="analytics-empty-desc">
              You do not have any published events eligible for report generation. Create an event in your organizer dashboard to generate sales and attendance reports.
            </p>
            <button type="button" className="analytics-empty-action font-['Orbitron']" onClick={onBack}>
              RETURN TO DASHBOARD
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
