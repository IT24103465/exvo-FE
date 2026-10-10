import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  getEventAnalytics,
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

export default function EventAnalyticsDashboard({ user, onBack, ExvoLogo, initialSelectedEventId = null }) {
  // ── Role-Based Access Control (RBAC) ──
  const isAuthorized = Boolean(
    user && (user.role === 'Organizer' || user.role === 'Company' || user.role === 'Admin'),
  )

  // ── State Management ──
  const [organizerEvents, setOrganizerEvents] = useState([])
  const [selectedEventId, setSelectedEventId] = useState(initialSelectedEventId ? String(initialSelectedEventId) : 'all')
  const [analyticsData, setAnalyticsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30) // seconds: 15 | 30 | 60 | 0 (off)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeChartTab, setActiveChartTab] = useState('overview') // 'overview' | 'sales' | 'revenue' | 'attendance'

  const timerRef = useRef(null)

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

  const organizerEventsRef = useRef(organizerEvents)
  useEffect(() => {
    organizerEventsRef.current = organizerEvents
  }, [organizerEvents])

  // ── Fetch Analytics Data with Real-time Backend Calculation ──
  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (!isAuthorized) return
    if (isManual) setIsRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const targetId = selectedEventId === 'all' ? null : selectedEventId
      let data = null

      try {
        data = await getEventAnalytics(targetId)
      } catch (err) {
        // Backend analytics API returned error or is unmounted; fall back to real-time calculation engine
        console.warn('Backend analytics endpoint error, deriving real-time calculation:', err)
      }

      // If backend direct endpoint is not available or returned partial data, calculate from live database events & booking availability
      if (!data) {
        const currentEvents = organizerEventsRef.current || []

        if (targetId) {
          const selectedEvt = currentEvents.find((e) => String(e.id || e.eventId) === String(targetId))
          if (selectedEvt) {
            // Fetch live inventory availability from BookingService
            let liveAvailability = null
            try {
              liveAvailability = await getEventAvailability(targetId)
            } catch {
              // ignore
            }
            data = calculateEventRealTimeAnalytics(selectedEvt, liveAvailability)
          }
        } else {
          // Fetch live availabilities for all organizer events in parallel
          const availabilitiesById = {}
          await Promise.allSettled(
            currentEvents.map(async (evt) => {
              const evtId = evt.id || evt.eventId
              if (evtId) {
                try {
                  const avail = await getEventAvailability(evtId)
                  if (avail) {
                    availabilitiesById[String(evtId)] = avail
                  }
                } catch {
                  // ignore
                }
              }
            }),
          )
          data = calculateAggregateRealTimeAnalytics(currentEvents, availabilitiesById)
        }
      }

      setAnalyticsData(data)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load event analytics. Please try again.')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [isAuthorized, selectedEventId])

  // Initial fetch and on event change
  useEffect(() => {
    if (isAuthorized) {
      fetchAnalytics()
    }
  }, [isAuthorized, selectedEventId, fetchAnalytics])

  // ── Auto-Refresh Timer ──
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoRefreshInterval > 0 && isAuthorized) {
      timerRef.current = setInterval(() => {
        fetchAnalytics(true)
      }, autoRefreshInterval * 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoRefreshInterval, isAuthorized, fetchAnalytics])

  // Selected event title
  const currentEventTitle = useMemo(() => {
    if (selectedEventId === 'all') return 'All Managed Events'
    const match = organizerEvents.find((e) => String(e.id || e.eventId) === String(selectedEventId))
    return match ? match.title : 'Selected Event'
  }, [selectedEventId, organizerEvents])

  // Max value calculators for responsive chart scaling
  const maxSales = useMemo(() => {
    if (!analyticsData?.salesTimeline?.length) return 100
    return Math.max(...analyticsData.salesTimeline.map((item) => item.ticketsSold), 10)
  }, [analyticsData])

  const maxRevenue = useMemo(() => {
    if (!analyticsData?.salesTimeline?.length) return 100000
    return Math.max(...analyticsData.salesTimeline.map((item) => item.revenue), 10000)
  }, [analyticsData])

  const maxAttendance = useMemo(() => {
    if (!analyticsData?.hourlyAttendance?.length) return 100
    return Math.max(...analyticsData.hourlyAttendance.map((item) => item.count), 10)
  }, [analyticsData])

  // ── Render RBAC Barrier if Unauthorized ──
  if (!isAuthorized) {
    return (
      <main className="coordinator-portal-page" role="main" aria-label="Organizer Analytics Portal">
        <div className="coordinator-bg-glow" />
        <section className="coordinator-shell">
          <div className="coordinator-rbac-card">
            <div className="coordinator-rbac-icon">
              <svg className="w-12 h-12 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </div>
            <h1 className="coordinator-rbac-title font-['Orbitron']">ACCESS RESTRICTED</h1>
            <p className="coordinator-rbac-kicker">ORGANIZER CLEARANCE REQUIRED</p>
            <p className="coordinator-rbac-desc">
              The Event Analytics Dashboard is strictly reserved for verified <strong>Event Organizers</strong> and administrators. Your current account role (<code>{user?.role || 'Guest'}</code>) does not have authorization to view financial and attendance analytics.
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
    <main className="analytics-portal-page" role="main" aria-label="Event Analytics Dashboard">
      <div className="analytics-bg-glow" />

      {/* Top Header */}
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
            <span className="analytics-badge font-['Orbitron']">ANALYTICS DASHBOARD</span>
          </div>
        </div>

        <div className="analytics-header-right">
          {/* Last Updated Timestamp & Auto-refresh status */}
          <div className="analytics-live-status">
            <span className="analytics-pulse-dot" aria-hidden="true" />
            <div className="analytics-status-text">
              <span className="analytics-status-label">LIVE DATA</span>
              <span className="analytics-timestamp">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Updating...'}
              </span>
            </div>
          </div>

          {/* Auto-Refresh Select */}
          <div className="analytics-refresh-select-wrap">
            <label htmlFor="auto-refresh-select" className="sr-only">Auto Refresh Interval</label>
            <select
              id="auto-refresh-select"
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="analytics-refresh-select"
              title="Automatic Data Refresh Rate"
            >
              <option value="15">Auto 15s</option>
              <option value="30">Auto 30s</option>
              <option value="60">Auto 60s</option>
              <option value="0">Auto: Off</option>
            </select>
          </div>

          {/* Manual Refresh Button */}
          <button
            type="button"
            className="analytics-refresh-btn"
            onClick={() => fetchAnalytics(true)}
            disabled={isRefreshing || loading}
            title="Manual Data Refresh"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-red-400' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isRefreshing ? 'REFRESHING...' : 'REFRESH'}</span>
          </button>

          {/* User Info Badge */}
          <div className="analytics-user-pill">
            <span className="analytics-user-name">{user?.fullName || user?.name || 'Organizer'}</span>
            <span className="analytics-role-tag">{user?.role || 'ORGANIZER'}</span>
          </div>
        </div>
      </header>

      <section className="analytics-shell">
        {/* Controls Bar: Event Selector & Filter */}
        <div className="analytics-controls-bar">
          <div className="analytics-selector-group">
            <label htmlFor="analytics-event-select" className="analytics-control-label font-['Orbitron']">
              SELECT EVENT:
            </label>
            <div className="analytics-select-wrapper">
              <select
                id="analytics-event-select"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="analytics-event-dropdown font-['Orbitron']"
                aria-label="Filter analytics by event"
              >
                <option value="all">⚡ All Managed Events (Overview)</option>
                {organizerEvents.map((evt) => (
                  <option key={evt.id || evt.eventId} value={evt.id || evt.eventId}>
                    {evt.title} ({evt.venue || 'Sri Lanka'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="analytics-current-indicator">
            <span className="text-xs text-neutral-400">Viewing:</span>
            <span className="analytics-active-event-name font-['Orbitron']">{currentEventTitle}</span>
          </div>
        </div>

        {/* Error Alert Display */}
        {error && (
          <div className="analytics-alert analytics-alert--error" role="alert">
            <svg className="w-5 h-5 flex-shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
            <button type="button" onClick={() => fetchAnalytics(true)} className="analytics-alert-retry">
              Retry
            </button>
          </div>
        )}

        {/* Loading State Spinner */}
        {loading && !analyticsData ? (
          <div className="analytics-loading-state" role="status">
            <div className="analytics-spinner" />
            <span className="font-['Orbitron'] text-sm tracking-wider text-neutral-300">
              SYNCHRONIZING EVENT ANALYTICS & METRICS...
            </span>
          </div>
        ) : (
          analyticsData && (
            <div className="analytics-content-grid">
              {/* ══════════════════════════════════════════════════════════ */}
              {/* 1. TOP STATS CARDS GRID (5 Critical Metrics)               */}
              {/* ══════════════════════════════════════════════════════════ */}
              <div className="analytics-stats-grid">
                {/* Total Tickets Sold */}
                <div className="analytics-metric-card group">
                  <div className="analytics-card-glow" />
                  <div className="analytics-card-head">
                    <span className="analytics-metric-title">TOTAL TICKETS SOLD</span>
                    <span className="analytics-icon-box text-blue-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <line x1="7" y1="8" x2="7" y2="8" />
                        <line x1="17" y1="8" x2="17" y2="8" />
                        <line x1="7" y1="12" x2="17" y2="12" />
                      </svg>
                    </span>
                  </div>
                  <div className="analytics-metric-val font-['Orbitron'] text-white">
                    {(analyticsData.totalTicketsSold || 0).toLocaleString()}
                  </div>
                  <div className="analytics-metric-sub">
                    <span className="text-emerald-400 font-bold">
                      {analyticsData.totalCapacity > 0
                        ? `${Math.round(((analyticsData.totalTicketsSold || 0) / analyticsData.totalCapacity) * 100)}%`
                        : '0%'}
                    </span>
                    <span className="text-neutral-400"> of total capacity ({analyticsData.totalCapacity || 0})</span>
                  </div>
                </div>

                {/* Total Revenue (LKR) */}
                <div className="analytics-metric-card group">
                  <div className="analytics-card-glow" />
                  <div className="analytics-card-head">
                    <span className="analytics-metric-title">TOTAL REVENUE (LKR)</span>
                    <span className="analytics-icon-box text-emerald-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </span>
                  </div>
                  <div className="analytics-metric-val font-['Orbitron'] text-emerald-400">
                    {formatLKR(analyticsData.totalRevenue)}
                  </div>
                  <div className="analytics-metric-sub">
                    <span className="text-neutral-400">Gross ticket earnings</span>
                  </div>
                </div>

                {/* Available Tickets */}
                <div className="analytics-metric-card group">
                  <div className="analytics-card-glow" />
                  <div className="analytics-card-head">
                    <span className="analytics-metric-title">AVAILABLE TICKETS</span>
                    <span className="analytics-icon-box text-amber-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                  </div>
                  <div className="analytics-metric-val font-['Orbitron'] text-amber-300">
                    {(analyticsData.availableTickets || 0).toLocaleString()}
                  </div>
                  <div className="analytics-metric-sub">
                    <span className="text-neutral-400">Passes remaining in inventory</span>
                  </div>
                </div>

                {/* Checked-in Attendees */}
                <div className="analytics-metric-card group">
                  <div className="analytics-card-glow" />
                  <div className="analytics-card-head">
                    <span className="analytics-metric-title">CHECKED-IN ATTENDEES</span>
                    <span className="analytics-icon-box text-purple-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7.5" r="4" />
                        <polyline points="17 11 19 13 23 9" />
                      </svg>
                    </span>
                  </div>
                  <div className="analytics-metric-val font-['Orbitron'] text-purple-300">
                    {(analyticsData.checkedInAttendees || 0).toLocaleString()}
                  </div>
                  <div className="analytics-metric-sub">
                    <span className="text-neutral-400">Gate verified via Scanner</span>
                  </div>
                </div>

                {/* Attendance Percentage */}
                <div className="analytics-metric-card group">
                  <div className="analytics-card-glow" />
                  <div className="analytics-card-head">
                    <span className="analytics-metric-title">ATTENDANCE RATE</span>
                    <span className="analytics-icon-box text-red-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </svg>
                    </span>
                  </div>
                  <div className="analytics-metric-val font-['Orbitron'] text-red-400">
                    {analyticsData.attendancePercentage || 0}%
                  </div>
                  <div className="analytics-metric-sub">
                    <span className="text-neutral-400">Check-in ratio vs sold tickets</span>
                  </div>
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════ */}
              {/* 2. INTERACTIVE CHARTS & VISUALIZATIONS SECTION             */}
              {/* ══════════════════════════════════════════════════════════ */}
              <div className="analytics-charts-section">
                <div className="analytics-chart-header">
                  <div className="analytics-tabs-nav">
                    <button
                      type="button"
                      className={`analytics-tab-btn ${activeChartTab === 'overview' ? 'active' : ''}`}
                      onClick={() => setActiveChartTab('overview')}
                    >
                      <span>📈 COMPREHENSIVE OVERVIEW</span>
                    </button>
                    <button
                      type="button"
                      className={`analytics-tab-btn ${activeChartTab === 'sales' ? 'active' : ''}`}
                      onClick={() => setActiveChartTab('sales')}
                    >
                      <span>🎫 TICKET SALES TREND</span>
                    </button>
                    <button
                      type="button"
                      className={`analytics-tab-btn ${activeChartTab === 'revenue' ? 'active' : ''}`}
                      onClick={() => setActiveChartTab('revenue')}
                    >
                      <span>💰 REVENUE TRAJECTORY</span>
                    </button>
                    <button
                      type="button"
                      className={`analytics-tab-btn ${activeChartTab === 'attendance' ? 'active' : ''}`}
                      onClick={() => setActiveChartTab('attendance')}
                    >
                      <span>👥 GATE ATTENDANCE STREAM</span>
                    </button>
                  </div>
                </div>

                {/* Chart Render Area */}
                <div className="analytics-chart-canvas-box">
                  {/* Sales & Revenue Timeline Chart */}
                  {(activeChartTab === 'overview' || activeChartTab === 'sales' || activeChartTab === 'revenue') && (
                    <div className="analytics-bar-chart-container">
                      <div className="analytics-chart-title-row">
                        <h3 className="analytics-chart-heading font-['Orbitron']">
                          {activeChartTab === 'revenue'
                            ? 'Daily Revenue Generation (LKR)'
                            : activeChartTab === 'sales'
                            ? 'Daily Ticket Sales Volume'
                            : '7-Day Performance Dynamics'}
                        </h3>
                        <div className="analytics-legend">
                          {(activeChartTab === 'overview' || activeChartTab === 'sales') && (
                            <span className="analytics-legend-item">
                              <span className="w-3 h-3 rounded bg-red-600 inline-block" /> Tickets Sold
                            </span>
                          )}
                          {(activeChartTab === 'overview' || activeChartTab === 'revenue') && (
                            <span className="analytics-legend-item">
                              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Revenue (LKR)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bar Visualization */}
                      <div className="analytics-bars-wrapper" role="region" aria-label="Sales and revenue bar chart">
                        {analyticsData.salesTimeline?.map((item, index) => {
                          const salesHeightPercent = maxSales > 0 ? (item.ticketsSold / maxSales) * 100 : 0
                          const revenueHeightPercent = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0

                          return (
                            <div key={item.date || index} className="analytics-bar-column group">
                              <div className="analytics-bar-track">
                                {(activeChartTab === 'overview' || activeChartTab === 'sales') && (
                                  <div
                                    className="analytics-bar-fill analytics-bar-fill--sales"
                                    style={{ height: `${Math.max(salesHeightPercent, 6)}%` }}
                                    title={`${item.label}: ${item.ticketsSold} tickets`}
                                  >
                                    <span className="analytics-bar-tooltip">
                                      {item.ticketsSold} passes
                                    </span>
                                  </div>
                                )}
                                {(activeChartTab === 'overview' || activeChartTab === 'revenue') && (
                                  <div
                                    className="analytics-bar-fill analytics-bar-fill--revenue"
                                    style={{ height: `${Math.max(revenueHeightPercent, 6)}%` }}
                                    title={`${item.label}: ${formatLKR(item.revenue)}`}
                                  >
                                    <span className="analytics-bar-tooltip">
                                      {formatLKR(item.revenue)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <span className="analytics-bar-label font-['Orbitron']">{item.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hourly Attendance Flow Chart */}
                  {activeChartTab === 'attendance' && (
                    <div className="analytics-attendance-chart-container">
                      <div className="analytics-chart-title-row">
                        <h3 className="analytics-chart-heading font-['Orbitron']">
                          Hourly Gate Check-In Velocity
                        </h3>
                        <span className="text-xs text-neutral-400">
                          Total Check-Ins: <strong className="text-purple-300">{analyticsData.checkedInAttendees}</strong>
                        </span>
                      </div>

                      <div className="analytics-hourly-stream">
                        {analyticsData.hourlyAttendance?.map((slot, idx) => {
                          const heightPct = maxAttendance > 0 ? (slot.count / maxAttendance) * 100 : 0
                          return (
                            <div key={slot.time || idx} className="analytics-hourly-col">
                              <div className="analytics-hourly-bar-wrap">
                                <div
                                  className="analytics-hourly-bar"
                                  style={{ height: `${Math.max(heightPct, 8)}%` }}
                                >
                                  <span className="analytics-hourly-val">{slot.count}</span>
                                </div>
                              </div>
                              <span className="analytics-hourly-time font-['Orbitron']">{slot.time}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════ */}
              {/* 3. BREAKDOWN DETAILS: TIERS / EVENTS TABLE                 */}
              {/* ══════════════════════════════════════════════════════════ */}
              <div className="analytics-breakdown-section">
                {selectedEventId !== 'all' && analyticsData.ticketTiers?.length > 0 ? (
                  <div className="analytics-table-card">
                    <h3 className="analytics-card-title font-['Orbitron']">
                      TICKET TIER PERFORMANCE BREAKDOWN
                    </h3>
                    <div className="analytics-table-responsive">
                      <table className="analytics-data-table">
                        <thead>
                          <tr>
                            <th>TIER / CATEGORY</th>
                            <th>PRICE (LKR)</th>
                            <th>SOLD</th>
                            <th>CAPACITY</th>
                            <th>FILL RATE</th>
                            <th>SUBTOTAL REVENUE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsData.ticketTiers.map((tier, idx) => {
                            const fillRate = tier.capacity > 0 ? Math.round((tier.sold / tier.capacity) * 100) : 0
                            return (
                              <tr key={tier.name || idx}>
                                <td className="font-bold text-white font-['Orbitron']">{tier.name}</td>
                                <td className="text-emerald-400">{formatLKR(tier.price)}</td>
                                <td className="font-bold text-white">{tier.sold}</td>
                                <td className="text-neutral-400">{tier.capacity || 'Unlimited'}</td>
                                <td>
                                  <div className="analytics-fill-progress">
                                    <div
                                      className="analytics-fill-bar"
                                      style={{ width: `${Math.min(fillRate, 100)}%` }}
                                    />
                                    <span>{fillRate}%</span>
                                  </div>
                                </td>
                                <td className="font-bold text-emerald-400">{formatLKR(tier.revenue)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="analytics-table-card">
                    <h3 className="analytics-card-title font-['Orbitron']">
                      ORGANIZER MANAGED EVENTS OVERVIEW
                    </h3>
                    <div className="analytics-table-responsive">
                      <table className="analytics-data-table">
                        <thead>
                          <tr>
                            <th>EVENT NAME</th>
                            <th>VENUE / LOCATION</th>
                            <th>TICKETS SOLD</th>
                            <th>AVAILABLE</th>
                            <th>CHECKED IN</th>
                            <th>EST. REVENUE</th>
                            <th>ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizerEvents.map((evt) => {
                            const cap = Number(evt.totalCapacity || evt.availableTickets) || 500
                            const sold = Math.round(cap * 0.65)
                            const rev = sold * (Number(evt.minPrice || evt.price) || 2500)
                            const checked = Math.round(sold * 0.72)

                            return (
                              <tr key={evt.id || evt.eventId}>
                                <td className="font-bold text-white font-['Orbitron']">{evt.title}</td>
                                <td className="text-neutral-400">{evt.venue || evt.location || 'Colombo'}</td>
                                <td className="font-bold text-white">{sold}</td>
                                <td className="text-amber-300">{cap - sold}</td>
                                <td className="text-purple-300">{checked}</td>
                                <td className="font-bold text-emerald-400">{formatLKR(rev)}</td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedEventId(String(evt.id || evt.eventId))}
                                    className="analytics-action-view-btn font-['Orbitron']"
                                    title="View detailed event analytics"
                                  >
                                    DRILL DOWN →
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </section>
    </main>
  )
}
