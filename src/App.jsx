import { useState, useEffect, useRef } from 'react'
import './App.css'
import { registerUser, loginUser, logoutUser, getCurrentUserProfile, updateUserProfile } from './services/authService'
import { getAllEvents, createEvent, updateEvent, deleteEvent, getCategories } from './services/eventService'

// Import local assets from src/assets
import sarithImg from './assets/sarith.jpg'
import wayoImg from './assets/wayo.jpg'
import wiramayaImg from './assets/wiramaya.jpg'
import backgroundVideo from './assets/bg_video.mp4'
const ExvoLogo = () => (
  <svg className="w-10 h-10" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Right vertical bar */}
    <path d="M 80 11 L 90 5 L 90 115 L 80 109 Z" fill="#FF0000" />
    {/* Stripe A1 (short top-left) */}
    <path d="M 24 24.6 L 60 3 L 60 13 L 24 34.6 Z" fill="#FF0000" />
    {/* Stripe A2 (long top) */}
    <path d="M 24 44.6 L 80 11 L 80 21 L 24 54.6 Z" fill="#FF0000" />
    {/* Stripe A3 & B3 (inner chevron) */}
    <path d="M 31.7 60 L 70 37 L 70 47 L 48.3 60 L 70 73 L 70 83 Z" fill="#FF0000" />
    {/* Stripe B2 (long bottom) */}
    <path d="M 24 65.4 L 80 99 L 80 109 L 24 75.4 Z" fill="#FF0000" />
    {/* Stripe B1 (short bottom-left) */}
    <path d="M 24 85.4 L 60 107 L 60 117 L 24 95.4 Z" fill="#FF0000" />
  </svg>
)

const readAuthState = () => {
  const token = localStorage.getItem('token')
  let user = null

  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    localStorage.removeItem('user')
  }

  return { isAuthenticated: Boolean(token), user }
}

const getUserDetails = (user) => {
  const details = user?.user || user || {}
  const name = details.fullName || details.name || details.username || details.companyName || 'Exvo Member'
  const email = details.email || 'Email unavailable'
  const role = details.role || 'Attendee'
  const companyName = details.companyName || ''
  const companyRegNumber = details.companyRegNumber || ''
  const contactNumber = details.contactNumber || details.phoneNumber || ''
  const address = details.address || ''
  const profilePicture = details.profilePicture || ''
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'E'

  return { name, email, role, companyName, companyRegNumber, contactNumber, address, profilePicture, initials }
}

// ── Sparkling particle canvas for footer ──
const SparkCanvas = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId
    let W, H

    const SPARK_COUNT = 90
    const rand = (a, b) => Math.random() * (b - a) + a

    const makeSpark = (fromBottom = false) => ({
      x: rand(0, W),
      y: fromBottom ? H + rand(0, 20) : rand(0, H),
      r: rand(0.4, 2.2),
      vx: rand(-0.15, 0.15),
      vy: rand(-0.4, -0.08),
      life: 0,
      maxLife: rand(120, 280),
      twinkleSpeed: rand(0.03, 0.07),
      twinklePhase: rand(0, Math.PI * 2),
    })

    let sparks = []

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      sparks = Array.from({ length: SPARK_COUNT }, () => {
        const s = makeSpark(false)
        s.life = rand(0, s.maxLife)
        return s
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      for (const s of sparks) {
        s.life++
        s.x += s.vx
        s.y += s.vy

        if (s.life > s.maxLife) {
          Object.assign(s, makeSpark(true))
          continue
        }

        const progress = s.life / s.maxLife
        let alpha = progress < 0.2
          ? progress / 0.2
          : progress > 0.8
            ? (1 - progress) / 0.2
            : 1

        const twinkle = 0.5 + 0.5 * Math.sin(s.life * s.twinkleSpeed + s.twinklePhase)
        alpha *= twinkle

        // glow halo
        ctx.save()
        ctx.globalAlpha = alpha * 0.3
        const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4)
        grd.addColorStop(0, 'rgba(255,255,255,1)')
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()
        ctx.restore()

        // core dot
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.restore()
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    draw()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

const albums = []

const AuthPage = ({ onBack, onSuccess, initialMode = 'login' }) => {
  const [authMode, setAuthMode] = useState(initialMode) // 'login' | 'register'
  const [accountType, setAccountType] = useState('booking') // 'booking' | 'company'
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Login form fields
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form fields
  const [fullName, setFullName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyRegNumber, setCompanyRegNumber] = useState('')
  const [contactNumber, setContactNumber] = useState('')

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage('Authenticating...')
    setIsSuccess(false)

    try {
      await loginUser(loginEmail, loginPassword)
      setIsSuccess(true)
      setMessage('Login successful! Welcome back.')
      setTimeout(onSuccess, 800)
    } catch (error) {
      setIsSuccess(false)
      setMessage(error.message || 'Invalid email or password.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage(accountType === 'company' ? 'Registering your company...' : 'Creating your account...')
    setIsSuccess(false)

    try {
      if (accountType === 'company') {
        await registerUser({
          fullName: companyName,
          companyName,
          companyRegNumber,
          contactNumber,
          email: registerEmail,
          password: registerPassword,
          role: 'Organizer'
        })
      } else {
        await registerUser({
          fullName,
          email: registerEmail,
          password: registerPassword,
          role: 'Attendee'
        })
      }

      setIsSuccess(true)
      setMessage('Account created successfully! Welcome to Exvo.')
      setTimeout(onSuccess, 900)
    } catch (error) {
      setIsSuccess(false)
      setMessage(error.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="background-glow background-glow--red" />
      <div className="background-glow background-glow--blue" />
      <div className="grain" />
      <section className="auth-card" aria-labelledby="auth-title">
        {/* Top bar with back button & Exvo Brand */}
        <div className="auth-card-header">
          <button className="login-back" type="button" onClick={onBack}>
            ← Back to home
          </button>
          <div className="auth-brand-badge">
            <ExvoLogo />
            <span><span className="text-[#FF0000]">EX</span>VO</span>
          </div>
        </div>

        {/* Primary Auth Mode Tabs: Sign In vs Create Account */}
        <div className="auth-mode-tabs" role="tablist">
          <button
            type="button"
            className={`auth-mode-tab ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => { setAuthMode('login'); setMessage('') }}
            role="tab"
            aria-selected={authMode === 'login'}
          >
            SIGN IN
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => { setAuthMode('register'); setMessage('') }}
            role="tab"
            aria-selected={authMode === 'register'}
          >
            CREATE ACCOUNT
          </button>
        </div>

        {/* Sub-Selector for Account Type when in Register Mode */}
        {authMode === 'register' && (
          <div className="account-type-toggle" role="radiogroup" aria-label="Account category selection">
            <button
              type="button"
              className={`account-type-btn ${accountType === 'booking' ? 'active' : ''}`}
              onClick={() => { setAccountType('booking'); setMessage('') }}
              aria-checked={accountType === 'booking'}
              role="radio"
            >
              Booking Ticket
            </button>
            <button
              type="button"
              className={`account-type-btn ${accountType === 'company' ? 'active' : ''}`}
              onClick={() => { setAccountType('company'); setMessage('') }}
              aria-checked={accountType === 'company'}
              role="radio"
            >
              Register Company
            </button>
          </div>
        )}

        {/* Login Form */}
        {authMode === 'login' && (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="auth-field-group">
              <label className="login-field-label" htmlFor="login-email">EMAIL / USERNAME</label>
              <div className="login-input-shell">
                <span className="login-field-icon" aria-hidden="true">♙</span>
                <input
                  id="login-email"
                  type="email"
                  placeholder="name@domain.com"
                  autoComplete="email"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="auth-field-group">
              <div className="login-password-row">
                <label className="login-field-label" htmlFor="login-password">PASSWORD</label>
                <button
                  className="login-forgot"
                  type="button"
                  onClick={() => setMessage('Password reset instructions are coming soon.')}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="login-input-shell">
                <span className="login-field-icon" aria-hidden="true">▣</span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  minLength="6"
                  required
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
                <button
                  className="login-eye"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? '◉' : '◌'}
                </button>
              </div>
            </div>

            <button className="login-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'AUTHENTICATING...' : 'LOGIN TO EXVO'} <span aria-hidden="true">→</span>
            </button>

            <p className="auth-bottom-switch">
              New to Exvo?
              <button type="button" onClick={() => { setAuthMode('register'); setMessage('') }}>
                Create an account
              </button>
            </p>
          </form>
        )}

        {/* Register Form */}
        {authMode === 'register' && (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            {accountType === 'booking' ? (
              <>
                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="register-full-name">FULL NAME</label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">♙</span>
                    <input
                      id="register-full-name"
                      type="text"
                      placeholder="Enter your full name"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="register-email">EMAIL ADDRESS</label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">@</span>
                    <input
                      id="register-email"
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      required
                      value={registerEmail}
                      onChange={(event) => setRegisterEmail(event.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="register-password">PASSWORD</label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">▣</span>
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      autoComplete="new-password"
                      minLength="6"
                      required
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                    />
                    <button
                      className="login-eye"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? '◉' : '◌'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="auth-grid-2">
                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-name">COMPANY NAME</label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">🏛</span>
                      <input
                        id="company-name"
                        type="text"
                        placeholder="Company Name"
                        required
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-reg-no">REGISTRATION NO</label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">#</span>
                      <input
                        id="company-reg-no"
                        type="text"
                        placeholder="e.g. PV001234"
                        required
                        value={companyRegNumber}
                        onChange={(event) => setCompanyRegNumber(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-grid-2">
                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-email">OFFICIAL EMAIL</label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">@</span>
                      <input
                        id="company-email"
                        type="email"
                        placeholder="company@domain.com"
                        autoComplete="email"
                        required
                        value={registerEmail}
                        onChange={(event) => setRegisterEmail(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-contact">CONTACT NO</label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">☎</span>
                      <input
                        id="company-contact"
                        type="tel"
                        placeholder="+94 7X XXX XXXX"
                        autoComplete="tel"
                        required
                        value={contactNumber}
                        onChange={(event) => setContactNumber(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="company-password">PASSWORD</label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">▣</span>
                    <input
                      id="company-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Strong password (min. 6 characters)"
                      autoComplete="new-password"
                      minLength="6"
                      required
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                    />
                    <button
                      className="login-eye"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? '◉' : '◌'}
                    </button>
                  </div>
                </div>
              </>
            )}

            <label className="register-terms">
              <input type="checkbox" required />
              <span>I agree to the <button type="button" onClick={() => setMessage('Terms of service will be available soon.')}>Terms</button> &amp; Privacy Policy.</span>
            </label>

            <button className="login-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'CREATING...' : (accountType === 'company' ? 'REGISTER COMPANY' : 'CREATE ACCOUNT')}{' '}
              <span aria-hidden="true">→</span>
            </button>

            <p className="auth-bottom-switch">
              Already have an account?
              <button type="button" onClick={() => { setAuthMode('login'); setMessage('') }}>
                Sign in
              </button>
            </p>
          </form>
        )}

        {message && (
          <p className="login-message" style={isSuccess ? { background: 'rgba(34, 197, 94, 0.12)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' } : {}} role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  )
}

function App() {
  const [albumList, setAlbumList] = useState([])
  const [centerIndex, setCenterIndex] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authInitialMode, setAuthInitialMode] = useState('login')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [authState, setAuthState] = useState(readAuthState)
  const [activeCategory, setActiveCategory] = useState(null)
  const [showAllEventsSection, setShowAllEventsSection] = useState(true)
  const [bookingModalEvent, setBookingModalEvent] = useState(null)
  const [selectedTier, setSelectedTier] = useState(null)
  const [ticketQuantity, setTicketQuantity] = useState(1)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: 'General Query', message: '' })
  const [contactSubmitted, setContactSubmitted] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    profilePicture: ''
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileFeedback, setProfileFeedback] = useState({ type: '', text: '' })

  // Add Event State
  const [dbCategories, setDbCategories] = useState([
    { id: 1, name: 'Music & Concerts' },
    { id: 2, name: 'Concert' },
    { id: 3, name: 'Festival' },
    { id: 4, name: 'Live Session' },
    { id: 5, name: 'DJ Night' },
    { id: 6, name: 'Acoustic' },
    { id: 7, name: 'Stand-Up' },
    { id: 8, name: 'EDM Arena' },
  ])
  const [newEventForm, setNewEventForm] = useState({
    title: '',
    artistOrOrganizer: '',
    categoryId: 1,
    category: 'Music & Concerts',
    date: '',
    time: '19:00',
    venue: '',
    ticketTiers: [
      { id: '1', name: 'General Admission', price: '2500', quantity: '500' },
      { id: '2', name: 'VIP Pass', price: '5000', quantity: '150' }
    ],
    coverImage: '',
    description: '',
  })
  const [eventPublishing, setEventPublishing] = useState(false)
  const [eventFeedback, setEventFeedback] = useState({ type: '', text: '' })

  // Organizer Dashboard & Edit Event State
  const [organizerDashboardOpen, setOrganizerDashboardOpen] = useState(false)
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [showEditEventModal, setShowEditEventModal] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)
  const [editEventForm, setEditEventForm] = useState({
    title: '',
    artistOrOrganizer: '',
    category: 'Concert',
    date: '',
    time: '19:00',
    venue: '',
    ticketTiers: [],
    coverImage: '',
    description: '',
  })
  const [editEventPublishing, setEditEventPublishing] = useState(false)
  const [editEventFeedback, setEditEventFeedback] = useState({ type: '', text: '' })

  const handleAddTicketTier = () => {
    setNewEventForm((prev) => ({
      ...prev,
      ticketTiers: [
        ...prev.ticketTiers,
        { id: String(Date.now()), name: '', price: '', quantity: '100' }
      ]
    }))
  }

  const handleRemoveTicketTier = (tierId) => {
    if (newEventForm.ticketTiers.length <= 1) return
    setNewEventForm((prev) => ({
      ...prev,
      ticketTiers: prev.ticketTiers.filter((t) => t.id !== tierId)
    }))
  }

  const handleUpdateTicketTier = (tierId, field, value) => {
    setNewEventForm((prev) => ({
      ...prev,
      ticketTiers: prev.ticketTiers.map((t) =>
        t.id === tierId ? { ...t, [field]: value } : t
      )
    }))
  }

  const handleSetQuickDate = (daysFromNow) => {
    const d = new Date()
    d.setDate(d.getDate() + daysFromNow)
    const formatted = d.toISOString().split('T')[0]
    setNewEventForm((prev) => ({ ...prev, date: formatted }))
  }

  const formatSelectedDate = (dateStr, timeStr) => {
    if (!dateStr) return ''
    try {
      const parts = dateStr.split('-')
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const formatted = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
      return `${formatted}${timeStr ? ` @ ${timeStr}` : ''}`
    } catch {
      return dateStr
    }
  }

  const videoRef = useRef(null)
  const catScrollRef = useRef(null)
  const autoplayRef = useRef(null)

  const scrollToSection = (sectionId) => {
    setMobileMenuOpen(false)
    if (sectionId === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleContactSubmit = (e) => {
    e.preventDefault()
    if (!contactForm.name || !contactForm.email || !contactForm.message) return
    setContactLoading(true)
    setTimeout(() => {
      setContactLoading(false)
      setContactSubmitted(true)
      setContactForm({ name: '', email: '', subject: 'General Query', message: '' })
      setTimeout(() => setContactSubmitted(false), 5000)
    }, 800)
  }

  useEffect(() => {
    const syncAuthState = () => setAuthState(readAuthState())
    window.addEventListener('storage', syncAuthState)
    return () => window.removeEventListener('storage', syncAuthState)
  }, [])

  // Sync latest user profile on authentication
  useEffect(() => {
    if (authState.isAuthenticated) {
      getCurrentUserProfile().then((profile) => {
        if (profile) {
          setAuthState(readAuthState())
        }
      })
    }
  }, [authState.isAuthenticated, profilePanelOpen])

  const fetchLiveEvents = async () => {
    try {
      const dbEvents = await getAllEvents()
      if (Array.isArray(dbEvents)) {
        const formattedEvents = dbEvents.map((e) => {
          let parsedTiers = []
          try {
            parsedTiers = typeof e.ticketTiers === 'string' ? JSON.parse(e.ticketTiers) : (e.ticketTiers || [])
          } catch {
            parsedTiers = []
          }
          const minTiersPrice = parsedTiers.length > 0 ? Math.min(...parsedTiers.map((t) => Number(t.price) || 0)) : 0
          const catName = typeof e.category === 'object' && e.category !== null 
            ? e.category.name 
            : (typeof e.category === 'string' ? e.category : (e.categoryName || 'Concert'))
          const eventDateVal = e.date || e.eventDate
          return {
            id: e.id,
            title: e.title,
            subtitle: e.artistOrOrganizer || e.organizerName || 'Live Event',
            artistOrOrganizer: e.artistOrOrganizer || e.organizerName || 'Featured Artist',
            cover: e.coverImage || e.imageUrl || null,
            year: eventDateVal ? new Date(eventDateVal).getFullYear().toString() : '2026',
            category: catName,
            venue: e.venue || e.location || 'Sri Lanka',
            minPrice: Number(e.minPrice || e.price) || minTiersPrice || 0,
            trackCount: `${catName} • From LKR ${Number(e.minPrice || e.price || minTiersPrice || 0).toLocaleString()} • ${e.venue || e.location || 'Sri Lanka'}`,
            ticketTiers: parsedTiers,
            totalCapacity: e.totalCapacity || e.availableTickets || 500,
            eventDate: eventDateVal,
            eventTime: e.time || '19:00',
            description: e.description,
            isDbEvent: true
          }
        })
        setAlbumList(formattedEvents)
        setCenterIndex(0)
      }
    } catch (err) {
      console.warn('Failed to fetch DB events:', err)
    }
  }

  // Fetch published events from database on mount & categories from Catalog API
  useEffect(() => {
    fetchLiveEvents()
    getCategories().then((cats) => {
      if (Array.isArray(cats) && cats.length > 0) {
        setDbCategories(cats)
        setNewEventForm((prev) => ({
          ...prev,
          categoryId: prev.categoryId || cats[0].id,
          category: prev.category || cats[0].name,
        }))
      }
    })
  }, [])

  const handleLogout = () => {
    logoutUser()
    setAuthState({ isAuthenticated: false, user: null })
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    setProfilePanelOpen(false)
    setShowAddEventModal(false)
    setIsEditingProfile(false)
  }

  const userDetails = getUserDetails(authState.user)
  const isOrganizer = authState.isAuthenticated && (userDetails.role === 'Organizer' || userDetails.role === 'Company')

  const handleEventCoverUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setEventFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP).' })
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_W = 800
        const scale = Math.min(1, MAX_W / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setNewEventForm((prev) => ({ ...prev, coverImage: canvas.toDataURL('image/jpeg', 0.88) }))
        setEventFeedback({ type: '', text: '' })
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    if (!newEventForm.title.trim() || !newEventForm.venue.trim() || !newEventForm.date) {
      setEventFeedback({ type: 'error', text: 'Please enter Event Title, Date, and Venue.' })
      return
    }

    const validTiers = newEventForm.ticketTiers.filter((t) => t.name.trim() && Number(t.price) > 0)
    if (validTiers.length === 0) {
      setEventFeedback({ type: 'error', text: 'Please add at least one valid ticket category with a price.' })
      return
    }

    setEventPublishing(true)
    setEventFeedback({ type: '', text: '' })

    try {
      const selectedCategoryObj = dbCategories.find(
        (c) => String(c.id) === String(newEventForm.categoryId) || c.name === newEventForm.category
      )
      const categoryIdVal = selectedCategoryObj ? selectedCategoryObj.id : (Number(newEventForm.categoryId) || 1)
      const categoryNameVal = selectedCategoryObj ? selectedCategoryObj.name : (newEventForm.category || 'Music & Concerts')

      // 1. Persist event to backend database (events table via Gateway)
      const res = await createEvent({
        title: newEventForm.title.trim(),
        artistOrOrganizer: newEventForm.artistOrOrganizer.trim() || userDetails.name || 'Organizer Event',
        categoryId: categoryIdVal,
        category: categoryNameVal,
        categoryName: categoryNameVal,
        date: newEventForm.date,
        time: newEventForm.time || '19:00',
        venue: newEventForm.venue.trim(),
        location: newEventForm.venue.trim(),
        ticketTiers: validTiers,
        coverImage: newEventForm.coverImage || null,
        description: newEventForm.description?.trim() || null,
      })

      const minPrice = Math.min(...validTiers.map((t) => Number(t.price) || 0))
      const totalCap = validTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)

      const createdItem = {
        id: res.id || Date.now(),
        title: res.title || newEventForm.title.trim(),
        subtitle: res.artistOrOrganizer || userDetails.name || 'Organizer Event',
        artistOrOrganizer: res.artistOrOrganizer || userDetails.name || 'Organizer Event',
        category: categoryNameVal,
        categoryId: categoryIdVal,
        venue: newEventForm.venue.trim() || 'Colombo',
        minPrice: minPrice,
        cover: res.coverImage || newEventForm.coverImage || null,
        year: newEventForm.date ? new Date(newEventForm.date).getFullYear().toString() : '2026',
        trackCount: `${categoryNameVal} • From LKR ${minPrice.toLocaleString()} • ${newEventForm.venue}`,
        ticketTiers: validTiers,
        totalCapacity: totalCap,
        eventDate: newEventForm.date,
        eventTime: newEventForm.time,
        isDbEvent: true
      }

      setAlbumList((prev) => [createdItem, ...prev])
      setCenterIndex(0)
      fetchLiveEvents()
      setEventFeedback({ type: 'success', text: 'Event successfully created in database and live on EXVO!' })

      setTimeout(() => {
        setShowAddEventModal(false)
        setEventFeedback({ type: '', text: '' })
        setNewEventForm({
          title: '',
          artistOrOrganizer: '',
          categoryId: dbCategories[0]?.id || 1,
          category: dbCategories[0]?.name || 'Music & Concerts',
          date: '',
          time: '19:00',
          venue: '',
          ticketTiers: [
            { id: '1', name: 'General Admission', price: '2500', quantity: '500' },
            { id: '2', name: 'VIP Pass', price: '5000', quantity: '150' }
          ],
          coverImage: '',
          description: '',
        })
        scrollToSection('home')
      }, 1000)
    } catch (err) {
      setEventFeedback({ type: 'error', text: err.message || 'Failed to publish event to backend.' })
    } finally {
      setEventPublishing(false)
    }
  }

  // Edit Event Handlers
  const handleStartEditEvent = (event) => {
    setEditingEventId(event.id)
    setEditEventForm({
      title: event.title || '',
      artistOrOrganizer: event.artistOrOrganizer || event.subtitle || '',
      category: event.category || 'Concert',
      date: event.eventDate || '',
      time: event.eventTime || '19:00',
      venue: event.venue || '',
      ticketTiers: event.ticketTiers && event.ticketTiers.length > 0 ? event.ticketTiers.map((t) => ({
        id: String(t.id || Date.now()),
        name: t.name || 'Pass',
        price: String(t.price || 0),
        quantity: String(t.quantity || 100)
      })) : [
        { id: '1', name: 'General Admission', price: String(event.minPrice || 2500), quantity: '500' }
      ],
      coverImage: event.cover || '',
      description: event.description || '',
    })
    setEditEventFeedback({ type: '', text: '' })
    setShowEditEventModal(true)
  }

  const handleAddTicketTierInEdit = () => {
    setEditEventForm((prev) => ({
      ...prev,
      ticketTiers: [
        ...prev.ticketTiers,
        { id: String(Date.now()), name: '', price: '', quantity: '100' }
      ]
    }))
  }

  const handleRemoveTicketTierInEdit = (tierId) => {
    if (editEventForm.ticketTiers.length <= 1) return
    setEditEventForm((prev) => ({
      ...prev,
      ticketTiers: prev.ticketTiers.filter((t) => t.id !== tierId)
    }))
  }

  const handleUpdateTicketTierInEdit = (tierId, field, value) => {
    setEditEventForm((prev) => ({
      ...prev,
      ticketTiers: prev.ticketTiers.map((t) =>
        t.id === tierId ? { ...t, [field]: value } : t
      )
    }))
  }

  const handleEditEventCoverUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setEditEventFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP).' })
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_W = 800
        const scale = Math.min(1, MAX_W / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setEditEventForm((prev) => ({ ...prev, coverImage: canvas.toDataURL('image/jpeg', 0.88) }))
        setEditEventFeedback({ type: '', text: '' })
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleUpdateEventSubmit = async (e) => {
    e.preventDefault()
    if (!editEventForm.title.trim() || !editEventForm.venue.trim() || !editEventForm.date) {
      setEditEventFeedback({ type: 'error', text: 'Please enter Event Title, Date, and Venue.' })
      return
    }

    const validTiers = editEventForm.ticketTiers.filter((t) => t.name.trim() && Number(t.price) > 0)
    if (validTiers.length === 0) {
      setEditEventFeedback({ type: 'error', text: 'Please add at least one valid ticket category with a price.' })
      return
    }

    setEditEventPublishing(true)
    setEditEventFeedback({ type: '', text: '' })

    try {
      const minPrice = Math.min(...validTiers.map((t) => Number(t.price) || 0))
      const totalCap = validTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)

      const payload = {
        id: editingEventId,
        title: editEventForm.title.trim(),
        artistOrOrganizer: editEventForm.artistOrOrganizer.trim() || userDetails.name || 'Organizer Event',
        category: editEventForm.category,
        date: editEventForm.date,
        time: editEventForm.time || '19:00',
        venue: editEventForm.venue.trim(),
        ticketTiers: validTiers,
        coverImage: editEventForm.coverImage || null,
        description: editEventForm.description?.trim() || null,
      }

      await updateEvent(editingEventId, payload)

      setAlbumList((prev) =>
        prev.map((e) =>
          e.id === editingEventId
            ? {
              ...e,
              title: payload.title,
              subtitle: payload.artistOrOrganizer,
              artistOrOrganizer: payload.artistOrOrganizer,
              category: payload.category,
              venue: payload.venue,
              minPrice: minPrice,
              cover: payload.coverImage || e.cover,
              eventDate: payload.date,
              eventTime: payload.time,
              description: payload.description,
              ticketTiers: validTiers,
              totalCapacity: totalCap,
            }
            : e
        )
      )

      await fetchLiveEvents()
      setEditEventFeedback({ type: 'success', text: 'Event updated successfully in Database!' })

      setTimeout(() => {
        setShowEditEventModal(false)
        setEditEventFeedback({ type: '', text: '' })
      }, 900)
    } catch (err) {
      setEditEventFeedback({ type: 'error', text: err.message || 'Failed to update event.' })
    } finally {
      setEditEventPublishing(false)
    }
  }

  const handleDeleteEvent = async (eventId, eventTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${eventTitle || 'this event'}" from the database?`)) {
      return
    }

    try {
      await deleteEvent(eventId)
      setAlbumList((prev) => prev.filter((e) => e.id !== eventId))
      await fetchLiveEvents()
    } catch (err) {
      alert(`Could not delete event: ${err.message || 'Error occurred'}`)
    }
  }

  const handleStartEditProfile = () => {
    setProfileForm({
      name: userDetails.name,
      email: userDetails.email,
      phoneNumber: userDetails.contactNumber,
      address: userDetails.address,
      profilePicture: userDetails.profilePicture,
    })
    setProfileFeedback({ type: '', text: '' })
    setIsEditingProfile(true)
  }

  const handleProfileImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP).' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileFeedback({ type: 'error', text: 'Image file size must be under 5MB.' })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const S_SIZE = 400
        canvas.width = S_SIZE
        canvas.height = S_SIZE
        const ctx = canvas.getContext('2d')

        // Smart 1:1 square crop (center horizontally, top-biased for portraits to capture head/face)
        const minDim = Math.min(img.width, img.height)
        const sx = (img.width - minDim) / 2
        // For portrait images, bias towards the top (face area) rather than dead center (belt/legs)
        const sy = img.height > img.width ? (img.height - minDim) * 0.2 : (img.height - minDim) / 2

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, S_SIZE, S_SIZE)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.9)
        setProfileForm((prev) => ({ ...prev, profilePicture: compressedBase64 }))
        setProfileFeedback({ type: 'success', text: 'Photo auto-cropped to circle! Click Save Changes.' })
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveProfileImage = () => {
    setProfileForm((prev) => ({ ...prev, profilePicture: '' }))
    setProfileFeedback({ type: 'success', text: 'Photo cleared. Click Save to apply.' })
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setProfileFeedback({ type: 'error', text: 'Name and Email are required.' })
      return
    }
    setProfileSaving(true)
    setProfileFeedback({ type: '', text: '' })

    try {
      await updateUserProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        phoneNumber: profileForm.phoneNumber.trim(),
        address: profileForm.address.trim(),
        profilePicture: profileForm.profilePicture,
      })
      setAuthState(readAuthState())
      setProfileFeedback({ type: 'success', text: 'Profile updated successfully!' })
      setTimeout(() => {
        setIsEditingProfile(false)
        setProfileFeedback({ type: '', text: '' })
      }, 1000)
    } catch (err) {
      setProfileFeedback({ type: 'error', text: err.message || 'Failed to update profile.' })
    } finally {
      setProfileSaving(false)
    }
  }

  const handleOpenBooking = (event) => {
    if (!authState.isAuthenticated) {
      setAuthInitialMode('login')
      setShowAuth(true)
      return
    }
    setBookingModalEvent(event)
    setSelectedTier(event.ticketTiers?.[0] || null)
    setTicketQuantity(1)
    setBookingSuccess(false)
  }

  // Auto-advance carousel every 3.5 s; pauses on hover
  useEffect(() => {
    if (isPaused) return
    autoplayRef.current = setInterval(() => {
      setCenterIndex((prev) => (prev < albumList.length - 1 ? prev + 1 : 0))
    }, 3500)
    return () => clearInterval(autoplayRef.current)
  }, [isPaused, albumList.length])

  // Reset autoplay timer on manual navigation
  const resetAutoplay = () => {
    clearInterval(autoplayRef.current)
    if (!isPaused) {
      autoplayRef.current = setInterval(() => {
        setCenterIndex((prev) => (prev < albumList.length - 1 ? prev + 1 : 0))
      }, 3500)
    }
  }

  const scrollCatLeft = () => {
    if (catScrollRef.current) {
      catScrollRef.current.scrollBy({ left: -220, behavior: 'smooth' })
    }
  }
  const scrollCatRight = () => {
    if (catScrollRef.current) {
      catScrollRef.current.scrollBy({ left: 220, behavior: 'smooth' })
    }
  }

  // Custom loop logic for background video (0:06 to 0:21)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const startTime = 6
    const endTime = 21

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.currentTime = startTime
      }
    };

    const handleCanPlay = () => {
      if (video.currentTime < startTime) {
        video.currentTime = startTime
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('canplay', handleCanPlay)

    if (video.currentTime < startTime) {
      video.currentTime = startTime
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [])

  // Show ONLY latest database events (up to 7 max). If database has fewer than 7 (e.g. 1, 2, 3), show only that exact count!
  const carouselEvents = albumList.slice(0, 7)

  const getCardClass = (index) => {
    if (carouselEvents.length <= 1) return 'card-center'
    const offset = index - centerIndex
    if (offset === 0) return 'card-center'
    if (offset === -1) return 'card-left-1'
    if (offset === -2) return 'card-left-2'
    if (offset <= -3) return 'card-left-3'
    if (offset === 1) return 'card-right-1'
    if (offset === 2) return 'card-right-2'
    if (offset >= 3) return 'card-right-3'
    return ''
  }

  const handlePrev = () => {
    if (carouselEvents.length <= 1) return
    setCenterIndex((prev) => (prev > 0 ? prev - 1 : carouselEvents.length - 1))
    resetAutoplay()
  }

  const handleNext = () => {
    if (carouselEvents.length <= 1) return
    setCenterIndex((prev) => (prev < carouselEvents.length - 1 ? prev + 1 : 0))
    resetAutoplay()
  }

  const activeAlbum = carouselEvents[centerIndex] || carouselEvents[0] || null

  const categoryDefinitions = [
    { id: 'all', label: 'All Events', glow: 'rgba(255,0,0,0.5)', icon: '🔥' },
    { id: 'Concert', label: 'Concert', glow: 'rgba(255,0,0,0.35)', icon: '🎸' },
    { id: 'Festival', label: 'Festival', glow: 'rgba(238,9,121,0.35)', icon: '🎪' },
    { id: 'Live Session', label: 'Live Session', glow: 'rgba(225,0,255,0.35)', icon: '🎤' },
    { id: 'DJ Night', label: 'DJ Night', glow: 'rgba(0,180,219,0.35)', icon: '🎧' },
    { id: 'Acoustic', label: 'Acoustic', glow: 'rgba(247,151,30,0.35)', icon: '🪕' },
    { id: 'Stand-Up', label: 'Stand-Up', glow: 'rgba(56,239,125,0.35)', icon: '🎙️' },
    { id: 'EDM Arena', label: 'EDM Arena', glow: 'rgba(255,102,0,0.35)', icon: '⚡' },
  ]

  const eventCategories = categoryDefinitions.map((cat) => {
    if (cat.id === 'all') {
      return {
        ...cat,
        count: `${albumList.length} ${albumList.length === 1 ? 'Event' : 'Events'}`,
        image: albumList[0]?.cover || null,
        realCount: albumList.length,
      }
    }
    const matching = albumList.filter((e) => {
      const eCat = (e.category || (e.trackCount ? e.trackCount.split('•')[0].trim() : '') || '').toLowerCase()
      return eCat.includes(cat.id.toLowerCase())
    })
    return {
      ...cat,
      count: `${matching.length} ${matching.length === 1 ? 'Event' : 'Events'}`,
      image: matching[0]?.cover || null,
      realCount: matching.length,
    }
  })

  const filteredEvents = albumList.filter((event) => {
    if (!activeCategory || activeCategory === 'all') return true
    const eCat = (event.category || (event.trackCount ? event.trackCount.split('•')[0].trim() : '') || '').toLowerCase()
    return eCat.includes(activeCategory.toLowerCase())
  })

  if (showAuth) {
    return (
      <AuthPage
        initialMode={authInitialMode}
        onBack={() => setShowAuth(false)}
        onSuccess={() => {
          setAuthState(readAuthState())
          setShowAuth(false)
        }}
      />
    )
  }

  return (
    <div id="home" className="min-h-screen bg-neutral-950 text-white relative overflow-hidden flex flex-col justify-between font-sans">

      {/* Background video - black & white, auto-play, loops from 0:06 to 0:21 */}
      <video
        ref={videoRef}
        src={backgroundVideo}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover filter grayscale opacity-20 pointer-events-none"
      />

      {/* Dark gradient overlay to blend the background video */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/45 to-neutral-950 pointer-events-none" />

      {/* Header / Navbar */}
      <header className="relative z-50 flex items-center justify-between px-6 md:px-12 py-6">

        {/* Left Side: EXVO Logo */}
        <div onClick={() => scrollToSection('home')} className="flex items-center gap-3 cursor-pointer select-none">
          <ExvoLogo />
          <span className="font-['Orbitron'] font-black text-2xl md:text-3xl tracking-widest flex">
            <span className="text-[#FF0000]">EX</span>
            <span className="text-white">VO</span>
          </span>
        </div>

        <div className="home-actions">
          <button
            type="button"
            className="nav-dash-btn"
            onClick={() => setOrganizerDashboardOpen(true)}
            title="Open Organizer Dashboard"
          >
            <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>DASHBOARD</span>
          </button>

          {isOrganizer && (
            <button
              type="button"
              className="nav-add-event-btn"
              onClick={() => setShowAddEventModal(true)}
              title="Create / Add New Event"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>ADD EVENT</span>
            </button>
          )}

          {authState.isAuthenticated && (
            <div className="profile-menu-wrap">
              <button
                className="profile-avatar"
                type="button"
                aria-label="Open profile options"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                {userDetails.profilePicture ? (
                  <img src={userDetails.profilePicture} alt={userDetails.name} className="profile-avatar__img" />
                ) : (
                  userDetails.initials
                )}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-compact-card">
                    {/* Left Avatar (Click to view full profile) */}
                    <button
                      type="button"
                      className="profile-compact-avatar"
                      title="View full profile"
                      aria-label="View full profile"
                      onClick={() => { setProfilePanelOpen(true); setProfileMenuOpen(false) }}
                    >
                      {userDetails.profilePicture ? (
                        <img src={userDetails.profilePicture} alt={userDetails.name} className="profile-avatar__img" />
                      ) : (
                        userDetails.initials
                      )}
                    </button>

                    {/* Center Info (Click to view full profile) */}
                    <div
                      className="profile-compact-info"
                      role="button"
                      tabIndex={0}
                      title="Click to view full profile"
                      onClick={() => { setProfilePanelOpen(true); setProfileMenuOpen(false) }}
                    >
                      <strong className="profile-compact-name">{userDetails.name}</strong>
                      <span className="profile-compact-email">{userDetails.email}</span>
                      <div className="profile-compact-badge-wrap">
                        <span className={`role-pill ${(userDetails.role === 'Organizer' || userDetails.role === 'Company') ? 'role-pill--organizer' : 'role-pill--attendee'}`}>
                          <span className="role-pill__dot" />
                          {(userDetails.role === 'Organizer' || userDetails.role === 'Company') ? 'ORGANIZER' : 'TICKET BOOKING'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Logout Icon Button */}
                    <button
                      type="button"
                      className="profile-compact-logout-btn"
                      title="Logout"
                      aria-label="Logout"
                      onClick={handleLogout}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-white hover:text-red-500 transition-colors focus:outline-none"
            aria-label="Toggle Navigation Menu"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8h16M4 16h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Redesigned Navigation Overlay Menu */}
      {mobileMenuOpen && (
        <div className="nav-overlay-fullscreen">
          <div className="nav-overlay-spotlight" />

          {/* Overlay Header Bar */}
          <div className="nav-overlay-header">
            <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => scrollToSection('home')}>
              <ExvoLogo />
              <span className="font-['Orbitron'] font-black text-2xl tracking-widest flex">
                <span className="text-[#FF0000]">EX</span>
                <span className="text-white">VO</span>
              </span>
            </div>

            <button
              className="nav-overlay-close-btn"
              type="button"
              aria-label="Close navigation overlay"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Overlay Menu Items */}
          <div className="nav-overlay-body">
            {(authState.isAuthenticated
              ? (isOrganizer
                ? ['HOME', 'EVENTS', 'ADD EVENT', 'ABOUT US', 'CONTACT', 'PROFILE', 'LOGOUT']
                : ['HOME', 'EVENTS', 'ABOUT US', 'CONTACT', 'PROFILE', 'LOGOUT'])
              : ['HOME', 'EVENTS', 'ABOUT US', 'CONTACT', 'LOGIN']).map((link) => (
                <button
                  key={link}
                  onClick={() => {
                    if (link === 'HOME') scrollToSection('home')
                    else if (link === 'EVENTS') scrollToSection('events')
                    else if (link === 'ADD EVENT') {
                      setMobileMenuOpen(false)
                      setShowAddEventModal(true)
                    }
                    else if (link === 'ABOUT US') scrollToSection('about-us')
                    else if (link === 'CONTACT') scrollToSection('contact-us')
                    else if (link === 'LOGIN') {
                      setMobileMenuOpen(false)
                      setShowAuth(true)
                      setAuthInitialMode('login')
                    }
                    else if (link === 'PROFILE') {
                      setMobileMenuOpen(false)
                      setProfilePanelOpen(true)
                    }
                    else if (link === 'LOGOUT') {
                      setMobileMenuOpen(false)
                      handleLogout()
                    }
                  }}
                  className="nav-overlay-item group"
                >
                  <span className="nav-overlay-label">{link}</span>
                </button>
              ))}
          </div>

          {/* Overlay Footer Ribbon */}
          <div className="nav-overlay-footer font-['Orbitron']">
            <span>EXVO EVENT ECOSYSTEM // 2026</span>
            <span className="text-red-500 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              SYSTEM ONLINE
            </span>
          </div>
        </div>
      )}

      {profilePanelOpen && (
        <div className="profile-panel-backdrop" role="presentation" onClick={() => { setProfilePanelOpen(false); setIsEditingProfile(false); }}>
          <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={(event) => event.stopPropagation()}>
            {/* Ambient Sci-Fi Corner Brackets */}
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            <button
              className="profile-panel__close"
              type="button"
              aria-label="Close profile"
              onClick={() => { setProfilePanelOpen(false); setIsEditingProfile(false); }}
            >
              ×
            </button>

            {!isEditingProfile ? (
              /* ── VIEW MODE ── */
              <div className="profile-view-mode">
                {/* Top Pass Ribbon */}
                <div className="profile-pass-ribbon font-['Orbitron']">
                  <span className="profile-pass-badge">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block mr-1.5" />
                    EXVO ID // 2026
                  </span>
                  <span className={`role-pill ${(userDetails.role === 'Organizer' || userDetails.role === 'Company') ? 'role-pill--organizer' : 'role-pill--attendee'}`}>
                    <span className="role-pill__dot" />
                    {(userDetails.role === 'Organizer' || userDetails.role === 'Company') ? 'ORGANIZER' : 'TICKET BOOKING'}
                  </span>
                </div>

                {/* Avatar with Futuristic Neon Energy Ring */}
                <div className="profile-avatar-wrap">
                  <div className="profile-avatar-ring">
                    <div className="profile-avatar-core">
                      {userDetails.profilePicture ? (
                        <img src={userDetails.profilePicture} alt={userDetails.name} className="profile-avatar-img" />
                      ) : (
                        <span className="profile-avatar-initials">{userDetails.initials}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="profile-avatar-edit-badge"
                    title="Change Profile Photo"
                    aria-label="Change Profile Photo"
                    onClick={handleStartEditProfile}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </button>
                </div>

                {/* Name & Email */}
                <div className="profile-header-info">
                  <h2 id="profile-title" className="profile-user-name">{userDetails.name}</h2>
                  <div className="profile-email-chip">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-red-500">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>{userDetails.email}</span>
                  </div>
                </div>

                {/* Modern Futuristic Tile Grid */}
                <div className="profile-tiles-grid">
                  <div className="profile-tile">
                    <div className="profile-tile-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-tile-icon">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="profile-tile-label">FULL NAME</span>
                    </div>
                    <div className="profile-tile-val">{userDetails.name}</div>
                  </div>

                  <div className="profile-tile">
                    <div className="profile-tile-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-tile-icon">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span className="profile-tile-label">PHONE</span>
                    </div>
                    <div className={`profile-tile-val ${!userDetails.contactNumber ? 'profile-tile-empty' : ''}`}>
                      {userDetails.contactNumber || (
                        <button type="button" onClick={handleStartEditProfile} className="profile-tile-add-btn">
                          + Add Phone
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="profile-tile profile-tile--full">
                    <div className="profile-tile-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-tile-icon">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span className="profile-tile-label">ADDRESS / LOCATION</span>
                    </div>
                    <div className={`profile-tile-val ${!userDetails.address ? 'profile-tile-empty' : ''}`}>
                      {userDetails.address || (
                        <button type="button" onClick={handleStartEditProfile} className="profile-tile-add-btn">
                          + Add Address
                        </button>
                      )}
                    </div>
                  </div>

                  {userDetails.companyName && userDetails.companyName !== userDetails.name && (
                    <div className="profile-tile">
                      <div className="profile-tile-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-tile-icon">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                        <span className="profile-tile-label">COMPANY</span>
                      </div>
                      <div className="profile-tile-val">{userDetails.companyName}</div>
                    </div>
                  )}

                  {userDetails.companyRegNumber && (
                    <div className="profile-tile">
                      <div className="profile-tile-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-tile-icon">
                          <line x1="4" y1="9" x2="20" y2="9" />
                          <line x1="4" y1="15" x2="20" y2="15" />
                          <line x1="10" y1="3" x2="8" y2="21" />
                          <line x1="16" y1="3" x2="14" y2="21" />
                        </svg>
                        <span className="profile-tile-label">REG NO</span>
                      </div>
                      <div className="profile-tile-val">{userDetails.companyRegNumber}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="profile-action-row">
                  <button
                    className="profile-btn-primary"
                    type="button"
                    onClick={handleStartEditProfile}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>EDIT PROFILE</span>
                  </button>
                  <button className="profile-btn-logout" type="button" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>LOGOUT</span>
                  </button>
                </div>
              </div>
            ) : (
              /* ── EDIT MODE ── */
              <form className="profile-edit-mode" onSubmit={handleSaveProfile}>
                <div className="profile-pass-ribbon font-['Orbitron']">
                  <span className="profile-pass-badge text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block mr-1.5" />
                    SYSTEM // EDIT MODE
                  </span>
                </div>

                <div className="profile-edit-header">
                  <h2 className="profile-user-name">Update Profile</h2>
                  <p className="text-xs text-gray-400">Modify your photo and contact credentials</p>
                </div>

                {/* Avatar Preview and Upload Area */}
                <div className="profile-edit-avatar-box">
                  <div className="profile-avatar-wrap">
                    <div className="profile-avatar-ring">
                      <div className="profile-avatar-core">
                        {profileForm.profilePicture ? (
                          <img src={profileForm.profilePicture} alt="Preview" className="profile-avatar-img" />
                        ) : (
                          <span className="profile-avatar-initials">{userDetails.initials}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="profile-upload-actions">
                    <label htmlFor="profile-pic-upload" className="profile-upload-trigger">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Choose Photo
                    </label>
                    <input
                      id="profile-pic-upload"
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                      onChange={handleProfileImageChange}
                    />
                    {profileForm.profilePicture && (
                      <button
                        type="button"
                        className="profile-btn-clear-photo"
                        onClick={handleRemoveProfileImage}
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>

                {/* Form Fields */}
                <div className="profile-form-grid">
                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-name">FULL NAME</label>
                    <div className="profile-field-input-shell">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-field-icon">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <input
                        id="edit-name"
                        type="text"
                        required
                        placeholder="Your full name"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-email">EMAIL ADDRESS</label>
                    <div className="profile-field-input-shell">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-field-icon">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      <input
                        id="edit-email"
                        type="email"
                        required
                        placeholder="your.email@domain.com"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-phone">PHONE NUMBER</label>
                    <div className="profile-field-input-shell">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-field-icon">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <input
                        id="edit-phone"
                        type="tel"
                        placeholder="+94 7X XXX XXXX"
                        value={profileForm.phoneNumber}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-address">ADDRESS</label>
                    <div className="profile-field-input-shell">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-field-icon">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <input
                        id="edit-address"
                        type="text"
                        placeholder="City, Country or Street"
                        value={profileForm.address}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {profileFeedback.text && (
                  <div className={`profile-feedback-badge ${profileFeedback.type === 'success' ? 'profile-feedback--success' : 'profile-feedback--error'}`}>
                    {profileFeedback.text}
                  </div>
                )}

                <div className="profile-action-row">
                  <button
                    className="profile-btn-primary"
                    type="submit"
                    disabled={profileSaving}
                  >
                    {profileSaving ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        SAVING...
                      </span>
                    ) : (
                      'SAVE CHANGES'
                    )}
                  </button>
                  <button
                    className="profile-btn-discard"
                    type="button"
                    disabled={profileSaving}
                    onClick={() => { setIsEditingProfile(false); setProfileFeedback({ type: '', text: '' }); }}
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* ══════════════ ORGANIZER ADD EVENT MODAL ══════════════ */}
      {showAddEventModal && (
        <div className="profile-panel-backdrop" role="presentation" onClick={() => setShowAddEventModal(false)}>
          <section className="profile-panel add-event-panel" role="dialog" aria-modal="true" aria-labelledby="add-event-title" onClick={(e) => e.stopPropagation()}>
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            <button
              className="profile-panel__close"
              type="button"
              aria-label="Close add event dialog"
              onClick={() => setShowAddEventModal(false)}
            >
              ×
            </button>

            <div className="profile-pass-ribbon font-['Orbitron']">
              <span className="profile-pass-badge text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block mr-1.5" />
                ORGANIZER PORTAL // EVENT CREATOR
              </span>
              <span className="role-pill role-pill--organizer">
                <span className="role-pill__dot" />
                ORGANIZER
              </span>
            </div>

            <div className="add-event-header">
              <h2 id="add-event-title" className="profile-user-name">Create Live Event</h2>
              <p className="text-xs text-neutral-400">Publish your concert or festival directly to the EXVO ecosystem</p>
            </div>

            <form onSubmit={handleCreateEvent} className="add-event-form space-y-3 mt-4 text-left">
              {/* Event Title */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">EVENT TITLE *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Neon Horizon Live 2026"
                  value={newEventForm.title}
                  onChange={(e) => setNewEventForm({ ...newEventForm, title: e.target.value })}
                  className="contact-input"
                />
              </div>

              {/* Artist / Band / Subtitle & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">PERFORMER / ARTIST</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarith Surith & News"
                    value={newEventForm.artistOrOrganizer}
                    onChange={(e) => setNewEventForm({ ...newEventForm, artistOrOrganizer: e.target.value })}
                    className="contact-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">CATEGORY</label>
                  <select
                    value={newEventForm.categoryId || newEventForm.category}
                    onChange={(e) => {
                      const selectedVal = e.target.value
                      const found = dbCategories.find((c) => String(c.id) === String(selectedVal) || c.name === selectedVal)
                      if (found) {
                        setNewEventForm({ ...newEventForm, categoryId: found.id, category: found.name })
                      } else {
                        setNewEventForm({ ...newEventForm, category: selectedVal })
                      }
                    }}
                    className="contact-input"
                  >
                    {dbCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Schedule & Interactive Calendar Picker ── */}
              <div className="add-event-section-box">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron'] flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    EVENT SCHEDULE & CALENDAR *
                  </label>
                  {newEventForm.date && (
                    <span className="add-event-date-preview font-['Orbitron']">
                      {formatSelectedDate(newEventForm.date, newEventForm.time)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={newEventForm.date}
                      onChange={(e) => setNewEventForm({ ...newEventForm, date: e.target.value })}
                      className="contact-input add-event-calendar-input"
                    />
                  </div>
                  <div>
                    <input
                      type="time"
                      value={newEventForm.time}
                      onChange={(e) => setNewEventForm({ ...newEventForm, time: e.target.value })}
                      className="contact-input add-event-time-input"
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Quick:</span>
                  <button type="button" onClick={() => handleSetQuickDate(1)} className="add-event-quick-chip">Tomorrow</button>
                  <button type="button" onClick={() => handleSetQuickDate(7)} className="add-event-quick-chip">+1 Week</button>
                  <button type="button" onClick={() => handleSetQuickDate(14)} className="add-event-quick-chip">+2 Weeks</button>
                  <button type="button" onClick={() => handleSetQuickDate(30)} className="add-event-quick-chip">+1 Month</button>
                </div>
              </div>

              {/* Venue / Location */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">VENUE / LOCATION *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CR&FC Grounds, Colombo 07"
                  value={newEventForm.venue}
                  onChange={(e) => setNewEventForm({ ...newEventForm, venue: e.target.value })}
                  className="contact-input"
                />
              </div>

              {/* ── Multiple Ticket Price Categories ── */}
              <div className="add-event-section-box">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron'] flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 012 2 2 2 0 01-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 012-2V7a2 2 0 00-2-2H5z" />
                      </svg>
                      TICKET PRICING & CATEGORIES *
                    </label>
                    <p className="text-[10px] text-neutral-400">Add multiple price tiers (VIP, General, Early Bird, etc.)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTicketTier}
                    className="add-event-add-tier-btn"
                  >
                    + Add Category
                  </button>
                </div>

                <div className="space-y-2">
                  {newEventForm.ticketTiers.map((tier) => (
                    <div key={tier.id} className="add-event-tier-card">
                      <div className="add-event-tier-grid">
                        {/* Tier Name */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">CATEGORY / PASS</span>
                          <input
                            type="text"
                            required
                            placeholder="e.g. VIP Pass"
                            value={tier.name}
                            onChange={(e) => handleUpdateTicketTier(tier.id, 'name', e.target.value)}
                            className="contact-input !py-1.5 text-xs"
                          />
                        </div>
                        {/* Price */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">PRICE (LKR)</span>
                          <input
                            type="number"
                            required
                            min="0"
                            placeholder="e.g. 3500"
                            value={tier.price}
                            onChange={(e) => handleUpdateTicketTier(tier.id, 'price', e.target.value)}
                            className="contact-input !py-1.5 text-xs"
                          />
                        </div>
                        {/* Quantity */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">QTY</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="100"
                            value={tier.quantity}
                            onChange={(e) => handleUpdateTicketTier(tier.id, 'quantity', e.target.value)}
                            className="contact-input !py-1.5 text-xs"
                          />
                        </div>
                        {/* Remove Button */}
                        {newEventForm.ticketTiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTicketTier(tier.id)}
                            className="add-event-tier-remove-btn"
                            title="Remove category"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Quick Suggestion Chips */}
                      {!tier.name && (
                        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/5 flex-wrap">
                          <span className="text-[8.5px] text-neutral-500 uppercase">Suggestions:</span>
                          {['VIP Pass', 'General Admission', 'Early Bird', 'Balcony', 'VVIP Table'].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleUpdateTicketTier(tier.id, 'name', tag)}
                              className="add-event-tag-chip"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Tier Summary Footer */}
                <div className="add-event-tiers-summary">
                  <span>
                    Total Capacity: <strong>{newEventForm.ticketTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)} Tickets</strong>
                  </span>
                  <span>
                    Price: <strong>
                      {newEventForm.ticketTiers.filter(t => Number(t.price) > 0).length > 0
                        ? `LKR ${Math.min(...newEventForm.ticketTiers.map(t => Number(t.price) || 0)).toLocaleString()} - ${Math.max(...newEventForm.ticketTiers.map(t => Number(t.price) || 0)).toLocaleString()}`
                        : 'Set prices above'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Event Cover Image Upload */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">EVENT BANNER / COVER POSTER</label>
                <div className="add-event-banner-wrap">
                  {newEventForm.coverImage ? (
                    <div className="add-event-banner-preview">
                      <img src={newEventForm.coverImage} alt="Cover preview" className="w-full h-32 object-cover rounded-xl border border-red-500/50 shadow-lg shadow-red-950/50" />
                      <button
                        type="button"
                        onClick={() => setNewEventForm({ ...newEventForm, coverImage: '' })}
                        className="add-event-banner-remove"
                      >
                        Remove Image
                      </button>
                    </div>
                  ) : (
                    <label className="add-event-banner-dropzone">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-red-500 mb-1.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span className="text-xs text-neutral-200 font-semibold font-['Orbitron']">Upload Event Poster</span>
                      <span className="text-[10px] text-neutral-400">PNG, JPG or WEBP (Optimized auto-fit)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleEventCoverUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">EVENT DESCRIPTION</label>
                <textarea
                  rows={2}
                  placeholder="Gate opening times, special rules, VIP benefits..."
                  value={newEventForm.description}
                  onChange={(e) => setNewEventForm({ ...newEventForm, description: e.target.value })}
                  className="contact-input resize-none"
                />
              </div>

              {eventFeedback.text && (
                <div className={`p-2.5 rounded-lg text-xs font-semibold ${eventFeedback.type === 'error' ? 'bg-red-950/70 border border-red-500/50 text-red-300' : 'bg-green-950/70 border border-green-500/50 text-green-300'}`}>
                  {eventFeedback.text}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={eventPublishing}
                  className="profile-btn-primary flex-1 !py-3"
                >
                  {eventPublishing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      PUBLISHING EVENT...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      PUBLISH EVENT LIVE
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="profile-btn-logout !px-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════ TICKET BOOKING MODAL ══════════════ */}
      {bookingModalEvent && (
        <div className="profile-panel-backdrop" role="presentation" onClick={() => setBookingModalEvent(null)}>
          <section className="profile-panel booking-modal-panel" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            <button
              className="profile-panel__close"
              type="button"
              aria-label="Close ticket booking"
              onClick={() => setBookingModalEvent(null)}
            >
              ×
            </button>

            {!bookingSuccess ? (
              <>
                <div className="profile-pass-ribbon font-['Orbitron']">
                  <span className="profile-pass-badge text-red-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block mr-1.5" />
                    EXVO SECURE TICKET GATEWAY
                  </span>
                  <span className="role-pill role-pill--client">
                    <span className="role-pill__dot" />
                    INSTANT PASS
                  </span>
                </div>

                <div className="booking-modal-hero">
                  <img
                    src={bookingModalEvent.cover}
                    alt={bookingModalEvent.title}
                    className="booking-modal-cover"
                  />
                  <div className="text-left">
                    <span className="event-category-pill mb-2 inline-block">
                      {bookingModalEvent.category || 'CONCERT'}
                    </span>
                    <h2 id="booking-modal-title" className="text-lg md:text-xl font-black text-white font-['Orbitron']">
                      {bookingModalEvent.title}
                    </h2>
                    <p className="text-xs text-red-400 font-['Orbitron'] mt-1">
                      {bookingModalEvent.artistOrOrganizer || bookingModalEvent.subtitle}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1.5">
                      📍 {bookingModalEvent.venue || 'Sri Lanka'}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      📅 {formatSelectedDate(bookingModalEvent.eventDate, bookingModalEvent.eventTime) || bookingModalEvent.year}
                    </p>
                  </div>
                </div>

                {/* Ticket Tiers Selection */}
                <div className="mt-5 text-left">
                  <label className="text-xs font-bold text-neutral-300 font-['Orbitron'] uppercase tracking-wider block mb-2">
                    Select Ticket Tier
                  </label>
                  {bookingModalEvent.ticketTiers && bookingModalEvent.ticketTiers.length > 0 ? (
                    <div className="space-y-2">
                      {bookingModalEvent.ticketTiers.map((tier, idx) => {
                        const isSelected = (selectedTier?.id ? selectedTier.id === tier.id : selectedTier?.name === tier.name) || (!selectedTier && idx === 0)
                        return (
                          <div
                            key={tier.id || idx}
                            onClick={() => setSelectedTier(tier)}
                            className={`booking-tier-card ${isSelected ? 'booking-tier-card--active' : ''}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-bold text-sm text-white font-['Orbitron']">{tier.name || `Tier ${idx + 1}`}</div>
                                {tier.description && (
                                  <div className="text-[10px] text-neutral-400 mt-0.5">{tier.description}</div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="font-black text-sm text-red-400 font-['Orbitron']">
                                  LKR {Number(tier.price || 0).toLocaleString()}
                                </div>
                                <div className="text-[9px] text-neutral-500 font-['Orbitron']">per pass</div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="booking-tier-card booking-tier-card--active">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-white font-['Orbitron']">Standard Pass</div>
                          <div className="text-[10px] text-neutral-400">General admission pass</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-sm text-red-400 font-['Orbitron']">
                            LKR {Number(bookingModalEvent.minPrice || 0).toLocaleString()}
                          </div>
                          <div className="text-[9px] text-neutral-500 font-['Orbitron']">per pass</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quantity Stepper */}
                <div className="mt-4 flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/10 text-left">
                  <div>
                    <span className="text-xs font-['Orbitron'] font-bold text-neutral-300">Ticket Quantity</span>
                    <p className="text-[10px] text-neutral-500">Max 10 passes per checkout</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setTicketQuantity(Math.max(1, ticketQuantity - 1))}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center transition-all cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-bold text-base text-white font-['Orbitron'] w-6 text-center">
                      {ticketQuantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTicketQuantity(Math.min(10, ticketQuantity + 1))}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center transition-all cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Total Summary */}
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-['Orbitron']">Total Payable</span>
                    <div className="text-xl font-black text-white font-['Orbitron']">
                      LKR {(Number(selectedTier?.price || bookingModalEvent.minPrice || 0) * ticketQuantity).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setBookingSubmitting(true)
                      setTimeout(() => {
                        setBookingSubmitting(false)
                        setBookingSuccess(true)
                      }, 600)
                    }}
                    disabled={bookingSubmitting}
                    className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(255,0,0,0.6)] flex items-center gap-2 cursor-pointer"
                  >
                    {bookingSubmitting ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        PROCESSING...
                      </>
                    ) : (
                      <>
                        CONFIRM RESERVATION
                        <span>→</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-2xl flex items-center justify-center mx-auto mb-3 animate-bounce">
                  ✓
                </div>
                <h3 className="text-xl font-black text-white font-['Orbitron'] uppercase">RESERVATION CONFIRMED!</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  Your passes for <strong className="text-white">{bookingModalEvent.title}</strong> have been reserved in the EXVO network.
                </p>

                {/* Digital Ticket Pass Card */}
                <div className="mt-5 p-4 rounded-xl bg-gradient-to-b from-neutral-900/90 to-black border border-red-500/30 text-left relative overflow-hidden">
                  <div className="cyber-bracket cyber-bracket--tl" />
                  <div className="cyber-bracket cyber-bracket--br" />

                  <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
                    <div>
                      <div className="text-[9px] text-red-500 font-bold font-['Orbitron'] tracking-widest">EXVO DIGITAL PASS</div>
                      <div className="text-sm font-bold text-white font-['Orbitron'] truncate max-w-[200px]">{bookingModalEvent.title}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-['Orbitron']">
                        VALID PASS
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 my-3 text-xs">
                    <div>
                      <span className="text-[9px] text-neutral-500 block font-['Orbitron']">TIER</span>
                      <strong className="text-white font-['Orbitron']">{selectedTier?.name || 'General Admission'}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block font-['Orbitron']">QUANTITY</span>
                      <strong className="text-white font-['Orbitron']">{ticketQuantity} {ticketQuantity === 1 ? 'Pass' : 'Passes'}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block font-['Orbitron']">DATE & TIME</span>
                      <strong className="text-white text-[11px]">{formatSelectedDate(bookingModalEvent.eventDate, bookingModalEvent.eventTime) || bookingModalEvent.year}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-neutral-500 block font-['Orbitron']">VENUE</span>
                      <strong className="text-white text-[11px] truncate block">{bookingModalEvent.venue || 'Colombo'}</strong>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-dashed border-white/20 flex items-center justify-between">
                    <div className="text-[10px] text-neutral-400 font-mono">
                      REF: EXVO-TKT-{Math.floor(100000 + Math.random() * 900000)}
                    </div>
                    <div className="text-xs font-black text-red-400 font-['Orbitron']">
                      LKR {(Number(selectedTier?.price || bookingModalEvent.minPrice || 0) * ticketQuantity).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingModalEvent(null)}
                    className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    DONE & CLOSE
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Main Hero View */}
      <main className="relative z-10 flex-grow flex flex-col items-center justify-center px-4 pt-4 pb-8 max-w-7xl mx-auto w-full">

        {/* Central Band Title: SARITH x NEWS */}
        <div className="text-center space-y-4 mb-6 md:mb-10 select-none">
          <h1 className="flex items-center justify-center gap-4 flex-wrap">
            <span className="font-extrabold text-5xl md:text-8xl tracking-tight leading-none text-white scale-y-105">
              UPCOMING
            </span>
            <span className="text-2xl md:text-4xl text-[#FF0000] font-light self-center">

            </span>
            <span className="font-['Orbitron'] font-black text-5xl md:text-8xl tracking-[0.1em] leading-none text-white">
              EVENTS
            </span>
          </h1>

          <p className="text-[10px] md:text-xs tracking-[0.25em] text-neutral-400 font-medium uppercase max-w-2xl mx-auto leading-loose">
            LATEST SINGLES &amp; ALBUMS FROM &amp; NEWS MUSIC{' '}

          </p>
        </div>

        {/* 3D Cover Flow Carousel */}
        {carouselEvents.length > 0 ? (
          <div
            className="w-full relative py-6 flex items-center justify-center perspective-container overflow-hidden"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="carousel-track">
              {carouselEvents.map((album, index) => {
                const cardClass = getCardClass(index)
                const isCenter = index === centerIndex
                return (
                  <div
                    key={album.id || index}
                    onClick={() => {
                      if (isCenter) {
                        handleOpenBooking(album)
                      } else {
                        setCenterIndex(index)
                        resetAutoplay()
                      }
                    }}
                    className={`carousel-card ${cardClass} group cursor-pointer`}
                    title={isCenter ? `Click to book: ${album.title}` : album.title}
                  >
                    {album.cover ? (
                      <img
                        src={album.cover}
                        alt={album.title}
                        className="w-full h-full object-cover select-none"
                        draggable="false"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-black flex items-center justify-center p-4 text-center">
                        <span className="text-3xl opacity-50">🎵</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80" />

                    {/* Center Card Title and Tag Overlay */}
                    {isCenter && (
                      <div className="absolute bottom-3 left-3 right-3 text-center pointer-events-none">
                        <span className="text-[9px] font-bold text-red-500 font-['Orbitron'] tracking-widest uppercase px-2 py-0.5 rounded bg-black/80 border border-red-500/40 inline-block mb-1 backdrop-blur-sm">
                          {album.category || 'FEATURED'}
                        </span>
                        <h3 className="text-sm md:text-base font-black text-white font-['Orbitron'] truncate drop-shadow-md">
                          {album.title}
                        </h3>
                        <p className="text-[10px] text-neutral-300 truncate">
                          {album.artistOrOrganizer || album.subtitle}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Previous/Next Navigation Arrows (only if more than 1 event) */}
            {carouselEvents.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-4 md:left-12 z-30 p-4 rounded-full bg-black/40 border border-white/10 hover:bg-white hover:text-black transition-all duration-300 cursor-pointer"
                  aria-label="Previous Album"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-4 md:right-12 z-30 p-4 rounded-full bg-black/40 border border-white/10 hover:bg-white hover:text-black transition-all duration-300 cursor-pointer"
                  aria-label="Next Album"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-10 px-4 my-6 rounded-2xl bg-black/40 border border-white/10 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-xl flex items-center justify-center mx-auto mb-3">
              🎪
            </div>
            <h3 className="text-sm font-bold font-['Orbitron'] text-white uppercase tracking-wider mb-1">No Database Events Yet</h3>
            <p className="text-[11px] text-neutral-400">Organizers can add live events using the "Add Event" button above.</p>
          </div>
        )}



        {/* Event Category Explore Section */}
        <div id="events" className="w-full mt-10 md:mt-14 px-2 scroll-mt-24">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#FF0000] uppercase font-bold mb-1">Browse</p>
              <h2 className="text-xl md:text-2xl font-black tracking-wider uppercase text-white font-['Orbitron']">Explore by Category</h2>
            </div>
            <button
              onClick={() => {
                setActiveCategory('all')
                const el = document.getElementById('all-events-grid')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 hover:text-white border border-neutral-700 hover:border-white px-4 py-2 rounded-full transition-all duration-300 font-semibold cursor-pointer active:scale-95 hover:bg-white/5"
            >
              View All ({albumList.length})
            </button>
          </div>

          <div className="category-scroll-wrapper">
            {/* Left Arrow */}
            <button
              onClick={scrollCatLeft}
              className="cat-nav-btn cat-nav-btn--left"
              aria-label="Scroll categories left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Scrollable strip */}
            <div ref={catScrollRef} className="category-grid">
              {eventCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(activeCategory === cat.id ? 'all' : cat.id)
                    const el = document.getElementById('all-events-grid')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className={`category-card ${activeCategory === cat.id ? 'category-card--active' : ''}`}
                  style={{ '--cat-glow': cat.glow }}
                  aria-label={`Explore ${cat.label} events`}
                >
                  {/* Photo or Cyber Gradient Icon background */}
                  {cat.image ? (
                    <img
                      src={cat.image}
                      alt={cat.label}
                      className="category-card__photo"
                      draggable="false"
                    />
                  ) : (
                    <div className="category-card__photo flex items-center justify-center bg-gradient-to-b from-[#1c0808] via-[#100505] to-[#080202]">
                      <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,0,0,0.5)] opacity-60">
                        {cat.icon}
                      </span>
                    </div>
                  )}
                  {/* Dark gradient overlay */}
                  <div className="category-card__overlay" />
                  <span className="category-card__label">{cat.label}</span>
                  <span className="category-card__count">{cat.count}</span>
                  <div className="category-card__shine" />
                </button>
              ))}
            </div>

            {/* Right Arrow */}
            <button
              onClick={scrollCatRight}
              className="cat-nav-btn cat-nav-btn--right"
              aria-label="Scroll categories right"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ══════════════ ALL EVENTS LIVE GRID SECTION ══════════════ */}
        <section id="all-events-grid" className="w-full mt-14 md:mt-20 px-2 scroll-mt-24">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-white/10 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                LIVE DATABASE EVENTS
              </div>
              <h2 className="text-2xl md:text-4xl font-black tracking-wider uppercase text-white font-['Orbitron']">
                {activeCategory && activeCategory !== 'all' ? (
                  <>EXPLORE <span className="text-[#FF0000]">{activeCategory}</span> EVENTS</>
                ) : (
                  <>ALL UPCOMING <span className="text-[#FF0000]">EXPERIENCES</span></>
                )}
              </h2>
              <p className="text-neutral-400 text-xs mt-1">
                Showing {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'} • Real-time database sync
              </p>
            </div>

            {/* Category Filter Pills & Reset */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-['Orbitron'] font-bold transition-all cursor-pointer ${!activeCategory || activeCategory === 'all'
                  ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(255,0,0,0.6)]'
                  : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
              >
                ALL ({albumList.length})
              </button>
              {['Concert', 'Festival', 'Live Session', 'DJ Night', 'Acoustic', 'Stand-Up'].map((catName) => {
                const count = albumList.filter((e) => ((e.category || '').toLowerCase().includes(catName.toLowerCase()))).length
                return (
                  <button
                    key={catName}
                    onClick={() => setActiveCategory(activeCategory === catName ? 'all' : catName)}
                    className={`px-3 py-1.5 rounded-full text-xs font-['Orbitron'] font-bold transition-all cursor-pointer ${activeCategory === catName
                      ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(255,0,0,0.6)]'
                      : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 border border-white/10'
                      }`}
                  >
                    {catName.toUpperCase()} {count > 0 && `(${count})`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Events Grid */}
          {filteredEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredEvents.map((event, idx) => {
                const eventPrice = Number(event.minPrice || 0)
                const dateDisplay = event.eventDate || event.year || '2026'
                return (
                  <div
                    key={event.id || idx}
                    className="event-cyber-card group"
                  >
                    <div className="event-cyber-card__poster-box">
                      <img
                        src={event.cover}
                        alt={event.title}
                        className="event-cyber-card__poster"
                        loading="lazy"
                      />
                      <div className="event-cyber-card__poster-overlay" />

                      {/* Top Badges */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                        <span className="event-category-pill">
                          {event.category || 'CONCERT'}
                        </span>
                        <span className="event-live-status-pill">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                          AVAILABLE
                        </span>
                      </div>

                      {/* Corner Accents */}
                      <div className="cyber-bracket cyber-bracket--tl" />
                      <div className="cyber-bracket cyber-bracket--br" />
                    </div>

                    <div className="event-cyber-card__content">
                      <div className="text-[10px] text-red-500 font-['Orbitron'] font-bold tracking-widest uppercase mb-1">
                        {event.artistOrOrganizer || event.subtitle}
                      </div>
                      <h3 className="text-lg font-bold text-white font-['Orbitron'] group-hover:text-red-400 transition-colors line-clamp-1">
                        {event.title}
                      </h3>

                      <div className="mt-3 space-y-1.5 text-xs text-neutral-300 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="text-red-500">📅</span>
                          <span>{formatSelectedDate(event.eventDate, event.eventTime) || dateDisplay}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-red-500">📍</span>
                          <span className="truncate">{event.venue || 'Colombo, Sri Lanka'}</span>
                        </div>
                      </div>

                      <div className="event-cyber-card__footer">
                        <div>
                          <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-['Orbitron']">Passes From</div>
                          <div className="text-sm md:text-base font-black text-white font-['Orbitron']">
                            {eventPrice > 0 ? `LKR ${eventPrice.toLocaleString()}` : 'FREE PASS'}
                          </div>
                        </div>

                        <button
                          onClick={() => handleOpenBooking(event)}
                          className="event-book-btn"
                        >
                          <span>BOOK PASS</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16 px-4 rounded-2xl bg-black/40 border border-white/10 my-6">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-2xl flex items-center justify-center mx-auto mb-4">
                🔍
              </div>
              <h3 className="text-xl font-bold font-['Orbitron'] text-white uppercase mb-2">No Events Found</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto mb-6">
                There are currently no events published under the "{activeCategory}" category.
              </p>
              <button
                onClick={() => setActiveCategory('all')}
                className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(255,0,0,0.5)] cursor-pointer"
              >
                View All Events
              </button>
            </div>
          )}
        </section>

      </main>

      {/* ══════════════ ABOUT US SECTION ══════════════ */}
      <section id="about-us" className="w-full py-16 md:py-24 px-4 border-t border-white/5 relative z-10 scroll-mt-20">
        <div className="max-w-7xl mx-auto">

          {/* Section Header */}
          <div className="text-center space-y-3 mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              ABOUT EXVO
            </div>
            <h2 className="text-3xl md:text-5xl font-black font-['Orbitron'] tracking-wider text-white uppercase">
              REDEFINING LIVE <span className="text-[#FF0000]">EXPERIENCES</span>
            </h2>
            <p className="text-neutral-400 text-xs md:text-sm max-w-2xl mx-auto leading-relaxed tracking-wide">
              EXVO is Sri Lanka's next-generation digital event platform. We connect music lovers, festival seekers, and artists with seamless booking and powerful organizer tools.
            </p>
          </div>

          {/* Vision & Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">

            {/* Feature 1 */}
            <div className="about-glass-card">
              <div className="about-card-icon">
                <svg className="w-6 h-6 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0h4m-4 0H9m4 0V5" />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-['Orbitron'] text-white tracking-wide uppercase mb-2">
                ORGANIZER HUB
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Comprehensive event management suite empowering companies and individual creators to list events, monitor real-time ticket sales, and manage check-ins effortlessly.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="about-glass-card">
              <div className="about-card-icon">
                <svg className="w-6 h-6 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 012 2 2 2 0 01-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 012-2V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-['Orbitron'] text-white tracking-wide uppercase mb-2">
                SMART TICKETING
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Instant digital ticket issuance with secure QR codes. Fast, hassle-free checkout experience with complete protection against ticket duplication and fraud.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="about-glass-card">
              <div className="about-card-icon">
                <svg className="w-6 h-6 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-['Orbitron'] text-white tracking-wide uppercase mb-2">
                CURATED CONCERTS
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Discover Sri Lanka's finest live performances, acoustic shows, mega music festivals, and high-octane DJ nights curated specially for passionate fans.
              </p>
            </div>

          </div>

          {/* Live Stats Bar */}
          <div className="stats-glass-grid">
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">50K+</span>
              <span className="stat-label">TICKETS BOOKED</span>
            </div>
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">1,200+</span>
              <span className="stat-label">LIVE EVENTS</span>
            </div>
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">100%</span>
              <span className="stat-label">SECURE QR ENTRY</span>
            </div>
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">24/7</span>
              <span className="stat-label">SUPPORT TEAM</span>
            </div>
          </div>

        </div>
      </section>

      {/* ══════════════ CONTACT US SECTION ══════════════ */}
      <section id="contact-us" className="w-full py-16 md:py-24 px-4 border-t border-white/5 relative z-10 scroll-mt-20">
        <div className="max-w-7xl mx-auto">

          {/* Section Header */}
          <div className="text-center space-y-3 mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              GET IN TOUCH
            </div>
            <h2 className="text-3xl md:text-5xl font-black font-['Orbitron'] tracking-wider text-white uppercase">
              CONTACT <span className="text-[#FF0000]">US</span>
            </h2>
            <p className="text-neutral-400 text-xs md:text-sm max-w-xl mx-auto leading-relaxed tracking-wide">
              Have questions about tickets, company registration, or organizing an event? Drop us a message below.
            </p>
          </div>

          {/* Form & Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Contact Form Column (7 cols) */}
            <div className="lg:col-span-7 contact-form-card">
              {contactSubmitted ? (
                <div className="contact-success-box animate-fade-in">
                  <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500 flex items-center justify-center text-red-500 mb-3 mx-auto">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-bold font-['Orbitron'] text-white uppercase">MESSAGE TRANSMITTED</h4>
                  <p className="text-xs text-neutral-400 mt-1">Thank you for reaching out! Our team will respond to your inquiry shortly.</p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">YOUR NAME</label>
                      <input
                        type="text"
                        required
                        placeholder="Enter your full name"
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        className="contact-input"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">EMAIL ADDRESS</label>
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="contact-input"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">INQUIRY TYPE</label>
                    <select
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      className="contact-input contact-select"
                    >
                      <option value="General Query">General Query</option>
                      <option value="Event Organizer Inquiry">Event Organizer / Company Inquiry</option>
                      <option value="Ticket Booking Support">Ticket Booking Support</option>
                      <option value="Partnership & Media">Partnership & Media</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">YOUR MESSAGE</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="How can we assist you?"
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className="contact-input resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={contactLoading}
                    className="contact-submit-btn"
                  >
                    {contactLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        TRANSMITTING...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        SEND MESSAGE
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </span>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Info Cards Column (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">EMAIL SUPPORT</h4>
                  <p className="text-xs text-neutral-400 mt-1">infodigexa@gmail.com</p>
                  <p className="text-xs text-neutral-400">exvo@gmail.com</p>
                </div>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">HEADQUARTERS</h4>

                  <p className="text-xs text-neutral-400">Colombo 03, Sri Lanka</p>
                </div>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">DIRECT HOTLINE</h4>
                  <p className="text-xs text-neutral-400 mt-1">+94 70 167 5173</p>
                  <p className="text-xs text-neutral-400">+94 76 641 4622</p>
                </div>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">OPERATING HOURS</h4>
                  <p className="text-xs text-neutral-400 mt-1">Monday – Sunday: 8:00 AM – 10:00 PM</p>
                  <p className="text-xs text-red-500 font-semibold mt-0.5">Instant Digital Support 24/7</p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="footer-root">

        {/* Spark canvas background */}
        <SparkCanvas />

        {/* ── Ticker marquee strip ── */}
        <div className="footer-ticker">
          <div className="footer-ticker__track">
            {[...Array(6)].map((_, i) => (
              <span key={i} className="footer-ticker__item">
                CONCERTS &nbsp;✦&nbsp; FESTIVALS &nbsp;✦&nbsp; LIVE SESSIONS &nbsp;✦&nbsp; DJ NIGHTS &nbsp;✦&nbsp; ACOUSTIC SHOWS &nbsp;✦&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* ── Main footer body ── */}
        <div className="footer-body">

          {/* Brand column */}
          <div className="footer-brand">
            <div className="footer-logo-row">
              <ExvoLogo />
              <span className="footer-wordmark">
                <span className="text-[#FF0000]">EX</span>VO
              </span>
            </div>
            <p className="footer-tagline">
              Sri Lanka's premier live event discovery platform.<br />
              Find your next unforgettable experience.
            </p>

            {/* Social icons */}
            <div className="footer-socials">
              {/* Instagram */}
              <a href="#" aria-label="Instagram" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
                </svg>
              </a>
              {/* Facebook */}
              <a href="#" aria-label="Facebook" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                </svg>
              </a>
              {/* YouTube */}
              <a href="#" aria-label="YouTube" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                </svg>
              </a>
              {/* TikTok */}
              <a href="#" aria-label="TikTok" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Nav columns */}
          <div className="footer-links-grid">
            <div className="footer-col">
              <h3 className="footer-col__heading">Navigate</h3>
              <ul className="footer-col__list">
                <li><button onClick={() => scrollToSection('home')} className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left">Home</button></li>
                <li><button onClick={() => scrollToSection('events')} className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left">Upcoming Events</button></li>
                <li><button onClick={() => scrollToSection('about-us')} className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left">About Us</button></li>
                <li><button onClick={() => scrollToSection('contact-us')} className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left">Contact Us</button></li>
              </ul>
            </div>

            <div className="footer-col">
              <h3 className="footer-col__heading">Connect</h3>
              <ul className="footer-col__list">
                {['List Your Event', 'Become a Partner', 'Press & Media', 'Careers'].map(l => (
                  <li key={l}><a href="#" className="footer-link">{l}</a></li>
                ))}
              </ul>
            </div>

            <div className="footer-col">
              <h3 className="footer-col__heading">Legal</h3>
              <ul className="footer-col__list">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Refund Policy'].map(l => (
                  <li key={l}><a href="#" className="footer-link">{l}</a></li>
                ))}
              </ul>
              <div className="footer-badge">
                <span className="footer-badge__dot" />
                Events live now
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="footer-bottom">
          <span className="footer-bottom__copy">
            © {new Date().getFullYear()} EXVO. All rights reserved.
          </span>
          <span className="footer-bottom__divider" />
          <span className="footer-bottom__credit">
            Crafted with ♥ by&nbsp;<strong>Digexa</strong>
          </span>
        </div>

      </footer>

      {/* ══════════════ RIGHT-SIDE ORGANIZER DASHBOARD DRAWER ══════════════ */}
      {organizerDashboardOpen && (
        <div
          className="organizer-drawer-backdrop"
          role="presentation"
          onClick={() => setOrganizerDashboardOpen(false)}
        >
          <aside
            className="organizer-drawer-right"
            role="dialog"
            aria-modal="true"
            aria-label="Organizer Dashboard"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Sci-Fi Brackets */}
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            {/* Drawer Header */}
            <div className="organizer-drawer-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 font-bold text-lg">
                  📊
                </div>
                <div>
                  <h2 className="text-base font-black font-['Orbitron'] text-white tracking-wider uppercase">
                    ORGANIZER DASHBOARD
                  </h2>
                  <p className="text-[11px] text-neutral-400 font-sans">
                    View, Edit & Delete Live Database Events
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="organizer-drawer-close"
                onClick={() => setOrganizerDashboardOpen(false)}
                aria-label="Close Dashboard"
              >
                ×
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-2.5 my-4">
              <div className="dash-stat-card">
                <span className="dash-stat-label">TOTAL EVENTS</span>
                <span className="dash-stat-val text-white">{albumList.length}</span>
              </div>
              <div className="dash-stat-card">
                <span className="dash-stat-label">TOTAL PASSES</span>
                <span className="dash-stat-val text-red-400">
                  {albumList.reduce((acc, e) => acc + (e.totalCapacity || 500), 0).toLocaleString()}
                </span>
              </div>
              <div className="dash-stat-card">
                <span className="dash-stat-label">DB STATUS</span>
                <span className="dash-stat-val text-emerald-400 text-xs flex items-center gap-1 justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              </div>
            </div>

            {/* Controls Bar: Search & Add Event Button */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">🔍</span>
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={dashboardSearch}
                  onChange={(e) => setDashboardSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setOrganizerDashboardOpen(false)
                  setShowAddEventModal(true)
                }}
                className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-[0_0_12px_rgba(255,0,0,0.4)]"
              >
                <span>+</span>
                <span>ADD</span>
              </button>
            </div>

            {/* Events List */}
            <div className="organizer-events-scroll space-y-3 pr-1">
              {albumList.filter(e => !dashboardSearch || e.title?.toLowerCase().includes(dashboardSearch.toLowerCase()) || e.venue?.toLowerCase().includes(dashboardSearch.toLowerCase())).length > 0 ? (
                albumList
                  .filter(e => !dashboardSearch || e.title?.toLowerCase().includes(dashboardSearch.toLowerCase()) || e.venue?.toLowerCase().includes(dashboardSearch.toLowerCase()))
                  .map((evt) => (
                    <div key={evt.id} className="dash-event-card group">
                      <div className="flex items-start gap-3">
                        {evt.cover ? (
                          <img
                            src={evt.cover}
                            alt={evt.title}
                            className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-500 text-xl font-bold shrink-0">
                            🎵
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="px-2 py-0.5 rounded bg-red-950/70 border border-red-500/40 text-[9px] font-bold font-['Orbitron'] text-red-400 uppercase truncate">
                              {evt.category || 'Concert'}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono font-bold">
                              From LKR {Number(evt.minPrice || 0).toLocaleString()}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white font-['Orbitron'] truncate group-hover:text-red-400 transition-colors">
                            {evt.title}
                          </h4>
                          <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                            📍 {evt.venue || 'Colombo'} • 📅 {evt.eventDate || '2026'}
                          </p>

                          {/* Action Buttons: EDIT & DELETE */}
                          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-white/5">
                            <button
                              type="button"
                              onClick={() => handleStartEditEvent(evt)}
                              className="dash-action-btn dash-action-btn--edit"
                              title="Edit Event Details"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              <span>EDIT</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(evt.id, evt.title)}
                              className="dash-action-btn dash-action-btn--delete"
                              title="Delete Event from Database"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span>DELETE</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-center py-12 text-neutral-500 text-xs font-['Orbitron']">
                  No events matching search criteria.
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ══════════════ EDIT EVENT MODAL ══════════════ */}
      {showEditEventModal && (
        <div className="add-event-backdrop" role="presentation" onClick={() => setShowEditEventModal(false)}>
          <div className="add-event-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="add-event-modal__close"
              onClick={() => setShowEditEventModal(false)}
            >
              ×
            </button>

            <div className="add-event-header">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                DATABASE EDIT MODE
              </div>
              <h2 className="text-2xl font-black font-['Orbitron'] text-white uppercase tracking-wider">
                EDIT <span className="text-[#FF0000]">EVENT</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Update event title, category, date, venue, ticket pricing, or poster image.
              </p>
            </div>

            <form onSubmit={handleUpdateEventSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">EVENT TITLE *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mega Music Fest 2026"
                    value={editEventForm.title}
                    onChange={(e) => setEditEventForm({ ...editEventForm, title: e.target.value })}
                    className="add-event-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">ARTIST OR ORGANIZER</label>
                  <input
                    type="text"
                    placeholder="e.g. Exvo Entertainment"
                    value={editEventForm.artistOrOrganizer}
                    onChange={(e) => setEditEventForm({ ...editEventForm, artistOrOrganizer: e.target.value })}
                    className="add-event-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">CATEGORY *</label>
                  <select
                    value={editEventForm.category}
                    onChange={(e) => setEditEventForm({ ...editEventForm, category: e.target.value })}
                    className="add-event-input"
                  >
                    <option value="Concert">Concert</option>
                    <option value="Festival">Festival</option>
                    <option value="Live Session">Live Session</option>
                    <option value="DJ Night">DJ Night</option>
                    <option value="Acoustic">Acoustic</option>
                    <option value="Stand-Up">Stand-Up</option>
                    <option value="EDM Arena">EDM Arena</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">EVENT DATE *</label>
                  <input
                    type="date"
                    required
                    value={editEventForm.date}
                    onChange={(e) => setEditEventForm({ ...editEventForm, date: e.target.value })}
                    className="add-event-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">TIME</label>
                  <input
                    type="time"
                    value={editEventForm.time}
                    onChange={(e) => setEditEventForm({ ...editEventForm, time: e.target.value })}
                    className="add-event-input"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">VENUE / LOCATION *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lotus Tower Arena, Colombo"
                  value={editEventForm.venue}
                  onChange={(e) => setEditEventForm({ ...editEventForm, venue: e.target.value })}
                  className="add-event-input"
                />
              </div>

              {/* Cover Image Upload */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">COVER IMAGE</label>
                <div className="flex items-center gap-3">
                  {editEventForm.coverImage && (
                    <img src={editEventForm.coverImage} alt="Cover Preview" className="w-12 h-12 rounded object-cover border border-white/20" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditEventCoverUpload}
                    className="text-xs text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-['Orbitron'] file:bg-red-600/20 file:text-red-400 hover:file:bg-red-600/40 cursor-pointer"
                  />
                </div>
              </div>

              {/* Ticket Tiers */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">TICKET CATEGORIES & PRICING *</label>
                  <button
                    type="button"
                    onClick={handleAddTicketTierInEdit}
                    className="text-[10px] font-['Orbitron'] text-red-400 hover:text-red-300 font-bold uppercase cursor-pointer"
                  >
                    + ADD TIER
                  </button>
                </div>
                {editEventForm.ticketTiers.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Category Name (e.g. VIP)"
                      value={tier.name}
                      onChange={(e) => handleUpdateTicketTierInEdit(tier.id, 'name', e.target.value)}
                      className="col-span-5 add-event-input text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Price (LKR)"
                      value={tier.price}
                      onChange={(e) => handleUpdateTicketTierInEdit(tier.id, 'price', e.target.value)}
                      className="col-span-4 add-event-input text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={tier.quantity}
                      onChange={(e) => handleUpdateTicketTierInEdit(tier.id, 'quantity', e.target.value)}
                      className="col-span-2 add-event-input text-xs"
                    />
                    {editEventForm.ticketTiers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTicketTierInEdit(tier.id)}
                        className="col-span-1 text-neutral-500 hover:text-red-400 text-sm text-center"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">DESCRIPTION</label>
                <textarea
                  rows={3}
                  placeholder="Event details..."
                  value={editEventForm.description}
                  onChange={(e) => setEditEventForm({ ...editEventForm, description: e.target.value })}
                  className="add-event-input resize-none"
                />
              </div>

              {editEventFeedback.text && (
                <div className={`p-3 rounded-xl text-xs font-bold ${editEventFeedback.type === 'error' ? 'bg-red-950/80 border border-red-500/50 text-red-300' : 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'}`}>
                  {editEventFeedback.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditEventModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-['Orbitron'] uppercase cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={editEventPublishing}
                  className="px-6 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(255,0,0,0.5)] cursor-pointer"
                >
                  {editEventPublishing ? 'SAVING...' : 'UPDATE EVENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default App