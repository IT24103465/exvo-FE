import { useState, useEffect, useRef } from 'react'
import './App.css'
import { registerUser, loginUser, logoutUser } from './services/authService'

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
  const name = details.fullName || details.name || details.username || 'Exvo member'
  const email = details.email || 'Email unavailable'
  const role = details.role || 'Attendee'
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'E'

  return { name, email, role, initials }
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

const albums = [
  {
    id: 0,
    title: 'Sarith Live',
    subtitle: 'Sarith Surith',
    cover: sarithImg,
    year: '2025',
    trackCount: 'Live Session'
  },
  {
    id: 1,
    title: 'Wayo EP',
    subtitle: 'Wayo Music',
    cover: wayoImg,
    year: '2026',
    trackCount: 'EP'
  },
  {
    id: 2,
    title: 'Hero Release',
    subtitle: 'Sarith Surith & News',
    cover: wiramayaImg,
    year: '2025',
    trackCount: 'Single'
  },
  {
    id: 3,
    title: 'Wiramaya',
    subtitle: 'Sarith & Surith',
    cover: wiramayaImg,
    year: '2026',
    trackCount: 'Album'
  },
  {
    id: 4,
    title: 'Jodu Jodu',
    subtitle: 'Sarith Surith & News',
    cover: sarithImg,
    year: '2026',
    trackCount: 'Latest Single'
  },
  {
    id: 5,
    title: 'Wayo Acoustic',
    subtitle: 'Wayo',
    cover: wayoImg,
    year: '2025',
    trackCount: 'Acoustic Session'
  },
  {
    id: 6,
    title: 'Wiramaya Live',
    subtitle: 'Sarith & Surith',
    cover: wiramayaImg,
    year: '2026',
    trackCount: 'Live Album'
  }
]

const RegisterPage = ({ onBack, onLogin }) => {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage('Creating your account...')

    try {
      await registerUser(fullName, email, password)
      setMessage('Registration successful! Redirecting to login...')
      setTimeout(onLogin, 2000)
    } catch (error) {
      setMessage(error.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="login-page register-page">
      <div className="background-glow background-glow--red" />
      <div className="background-glow background-glow--blue" />
      <div className="grain" />
      <section className="login-card register-card" aria-labelledby="register-title">
        <button className="login-back" type="button" onClick={onBack}>← Back to login</button>
        <div className="login-brand"><ExvoLogo /><span><span className="text-[#FF0000]">EX</span>VO</span></div>
        <div className="login-heading">
          <p className="login-eyebrow">Join the experience</p>
          <h1 id="register-title">CREATE ACCOUNT</h1>
          <p className="login-intro">Create your Exvo profile and discover what is happening next.</p>
        </div>
        <form className="login-form register-form" onSubmit={handleSubmit}>
          <label className="login-field-label" htmlFor="full-name">FULL NAME</label>
          <div className="login-input-shell"><span className="login-field-icon" aria-hidden="true">♙</span><input id="full-name" type="text" placeholder="Enter your full name" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
          <label className="login-field-label" htmlFor="register-email">EMAIL ADDRESS</label>
          <div className="login-input-shell"><span className="login-field-icon" aria-hidden="true">@</span><input id="register-email" type="email" placeholder="Enter your email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <label className="login-field-label" htmlFor="register-password">PASSWORD</label>
          <div className="login-input-shell"><span className="login-field-icon" aria-hidden="true">▣</span><input id="register-password" type={showPassword ? 'text' : 'password'} placeholder="Create a password" autoComplete="new-password" minLength="6" required value={password} onChange={(event) => setPassword(event.target.value)} /><button className="login-eye" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? '◉' : '◌'}</button></div>
          <label className="register-terms"><input type="checkbox" required /><span>I agree to the <button type="button" onClick={() => setMessage('Terms of service will be available soon.')}>Terms of Service</button> and Privacy Policy.</span></label>
          <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? 'CREATING...' : 'CREATE ACCOUNT'} <span aria-hidden="true">→</span></button>
        </form>
        <div className="login-divider"><span>OR CONTINUE WITH</span></div>
        <button className="login-google" type="button" onClick={() => setMessage('Google sign-up is ready to connect.')}><strong>G</strong> CONTINUE WITH GOOGLE</button>
        <p className="login-signup">Already have an account? <button type="button" onClick={onLogin}>Sign in</button></p>
        {message && <p className="login-message" role="status">{message}</p>}
      </section>
    </main>
  )
}

const LoginPage = ({ onBack, onRegister, onSuccess }) => {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage('Authenticating...')

    try {
      await loginUser(email, password)
      setMessage('Login successful! Welcome back.')
      setTimeout(onSuccess, 1000)
    } catch (error) {
      setMessage(error.message || 'Invalid email or password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="background-glow background-glow--red" />
      <div className="background-glow background-glow--blue" />
      <div className="grain" />
      <section className="login-card" aria-labelledby="login-title">
        <button className="login-back" type="button" onClick={onBack}>← Back to home</button>
        <div className="login-brand"><ExvoLogo /><span><span className="text-[#FF0000]">EX</span>VO</span></div>
        <div className="login-heading">
          <p className="login-eyebrow">Welcome back</p>
          <h1 id="login-title">LOGIN</h1>
          <p className="login-intro">Step back into your world of extraordinary events.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field-label" htmlFor="email">EMAIL / USERNAME</label>
          <div className="login-input-shell">
            <span className="login-field-icon" aria-hidden="true">♙</span>
            <input id="email" type="email" placeholder="Enter your email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="login-password-row">
            <label className="login-field-label" htmlFor="password">PASSWORD</label>
            <button className="login-forgot" type="button" onClick={() => setMessage('Password reset instructions are coming soon.')}>Forgot Password?</button>
          </div>
          <div className="login-input-shell">
            <span className="login-field-icon" aria-hidden="true">▣</span>
            <input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" minLength="6" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="login-eye" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? '◉' : '◌'}</button>
          </div>
          <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? 'AUTHENTICATING...' : 'LOGIN'} <span aria-hidden="true">→</span></button>
        </form>
        <div className="login-divider"><span>OR CONTINUE WITH</span></div>
        <button className="login-google" type="button" onClick={() => setMessage('Google sign-in is ready to connect.')}><strong>G</strong> CONTINUE WITH GOOGLE</button>
        <p className="login-signup">New to Exvo? <button type="button" onClick={onRegister}>Create an account</button></p>
        {message && <p className="login-message" role="status">{message}</p>}
      </section>
    </main>
  )
}

function App() {
  const [centerIndex, setCenterIndex] = useState(3)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [authState, setAuthState] = useState(readAuthState)
  const [activeCategory, setActiveCategory] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const videoRef = useRef(null)
  const catScrollRef = useRef(null)
  const autoplayRef = useRef(null)

  useEffect(() => {
    const syncAuthState = () => setAuthState(readAuthState())
    window.addEventListener('storage', syncAuthState)
    return () => window.removeEventListener('storage', syncAuthState)
  }, [])

  const handleLogout = () => {
    logoutUser()
    setAuthState({ isAuthenticated: false, user: null })
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    setProfilePanelOpen(false)
  }

  const userDetails = getUserDetails(authState.user)

  // Auto-advance carousel every 3.5 s; pauses on hover
  useEffect(() => {
    if (isPaused) return
    autoplayRef.current = setInterval(() => {
      setCenterIndex((prev) => (prev < albums.length - 1 ? prev + 1 : 0))
    }, 3500)
    return () => clearInterval(autoplayRef.current)
  }, [isPaused])

  // Reset autoplay timer on manual navigation
  const resetAutoplay = () => {
    clearInterval(autoplayRef.current)
    if (!isPaused) {
      autoplayRef.current = setInterval(() => {
        setCenterIndex((prev) => (prev < albums.length - 1 ? prev + 1 : 0))
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

  const getCardClass = (index) => {
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
    setCenterIndex((prev) => (prev > 0 ? prev - 1 : albums.length - 1))
    resetAutoplay()
  }

  const handleNext = () => {
    setCenterIndex((prev) => (prev < albums.length - 1 ? prev + 1 : 0))
    resetAutoplay()
  }

  const activeAlbum = albums[centerIndex]

  const eventCategories = [
    {
      id: 'concert',
      label: 'Concert',
      count: '24 Events',
      image: wiramayaImg,
      glow: 'rgba(255,0,0,0.35)'
    },
    {
      id: 'festival',
      label: 'Festival',
      count: '11 Events',
      image: sarithImg,
      glow: 'rgba(238,9,121,0.35)'
    },
    {
      id: 'live',
      label: 'Live Session',
      count: '18 Events',
      image: wayoImg,
      glow: 'rgba(225,0,255,0.35)'
    },
    {
      id: 'dj',
      label: 'DJ Night',
      count: '9 Events',
      image: wiramayaImg,
      glow: 'rgba(0,180,219,0.35)'
    },
    {
      id: 'acoustic',
      label: 'Acoustic',
      count: '15 Events',
      image: sarithImg,
      glow: 'rgba(247,151,30,0.35)'
    },
    {
      id: 'standup',
      label: 'Stand-Up',
      count: '7 Events',
      image: wayoImg,
      glow: 'rgba(56,239,125,0.35)'
    },
  ]

  if (showRegister) {
    return <RegisterPage onBack={() => setShowRegister(false)} onLogin={() => { setShowRegister(false); setShowLogin(true) }} />
  }

  if (showLogin) {
    return <LoginPage onBack={() => setShowLogin(false)} onRegister={() => { setShowLogin(false); setShowRegister(true) }} onSuccess={() => { setAuthState(readAuthState()); setShowLogin(false) }} />
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden flex flex-col justify-between font-sans">

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
        <div className="flex items-center gap-3 cursor-pointer select-none">
          <ExvoLogo />
          <span className="font-['Orbitron'] font-black text-2xl md:text-3xl tracking-widest flex">
            <span className="text-[#FF0000]">EX</span>
            <span className="text-white">VO</span>
          </span>
        </div>

        <div className="home-actions">
          {authState.isAuthenticated && (
            <div className="profile-menu-wrap">
              <button className="profile-avatar" type="button" aria-label="Open profile options" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
                {userDetails.initials}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu__summary"><strong>{userDetails.name}</strong><span>{userDetails.email}</span></div>
                  <button type="button" role="menuitem" onClick={() => { setProfilePanelOpen(true); setProfileMenuOpen(false) }}>View profile</button>
                  <button type="button" role="menuitem" onClick={handleLogout}>Logout</button>
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

      {/* Navigation Overlay Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center space-y-8 animate-fade-in">
          {(authState.isAuthenticated
            ? ['HOME', 'EVENTS', 'ABOUT US', 'CONTACT', 'PROFILE', 'LOGOUT']
            : ['HOME', 'EVENTS', 'ABOUT US', 'CONTACT', 'LOGIN']).map((link) => (
            <button
              key={link}
              onClick={() => {
                setMobileMenuOpen(false)
                if (link === 'LOGIN') setShowLogin(true)
                if (link === 'LOGOUT') handleLogout()
              }}
              className="text-2xl md:text-4xl font-extrabold tracking-widest hover:text-[#FF0000] transition-colors uppercase"
            >
              {link}
            </button>
          ))}
        </div>
      )}

      {profilePanelOpen && (
        <div className="profile-panel-backdrop" role="presentation" onClick={() => setProfilePanelOpen(false)}>
          <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={(event) => event.stopPropagation()}>
            <button className="profile-panel__close" type="button" aria-label="Close profile" onClick={() => setProfilePanelOpen(false)}>×</button>
            <div className="profile-panel__avatar">{userDetails.initials}</div>
            <p className="login-eyebrow">Your Exvo profile</p>
            <h2 id="profile-title">{userDetails.name}</h2>
            <p className="profile-panel__email">{userDetails.email}</p>
            <div className="profile-panel__detail"><span>ACCOUNT TYPE</span><strong>{userDetails.role}</strong></div>
            <button className="profile-panel__logout" type="button" onClick={handleLogout}>LOGOUT</button>
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
            LATEST SINGLES &amp; ALBUMS FROM  &amp; NEWS MUSIC{' '}

          </p>
        </div>

        {/* 3D Cover Flow Carousel */}
        <div
          className="w-full relative py-6 flex items-center justify-center perspective-container overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="carousel-track">
            {albums.map((album, index) => {
              const cardClass = getCardClass(index)
              return (
                <div
                  key={album.id}
                  onClick={() => { setCenterIndex(index); resetAutoplay() }}
                  className={`carousel-card ${cardClass}`}
                >
                  <img
                    src={album.cover}
                    alt={album.title}
                    className="w-full h-full object-cover select-none"
                    draggable="false"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                </div>
              )
            })}
          </div>

          {/* Previous/Next Navigation Arrows */}
          <button
            onClick={handlePrev}
            className="absolute left-4 md:left-12 z-30 p-4 rounded-full bg-black/40 border border-white/10 hover:bg-white hover:text-black transition-all duration-300"
            aria-label="Previous Album"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            className="absolute right-4 md:right-12 z-30 p-4 rounded-full bg-black/40 border border-white/10 hover:bg-white hover:text-black transition-all duration-300"
            aria-label="Next Album"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Event Category Explore Section */}
        <div className="w-full mt-10 md:mt-14 px-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#FF0000] uppercase font-bold mb-1">Browse</p>
              <h2 className="text-xl md:text-2xl font-black tracking-wider uppercase text-white">Explore by Category</h2>
            </div>
            <button className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 hover:text-white border border-neutral-700 hover:border-white px-4 py-2 rounded-full transition-all duration-300 font-semibold">
              View All
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
                  onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                  className={`category-card ${activeCategory === cat.id ? 'category-card--active' : ''}`}
                  style={{ '--cat-glow': cat.glow }}
                  aria-label={`Explore ${cat.label} events`}
                >
                  {/* Photo background */}
                  <img
                    src={cat.image}
                    alt={cat.label}
                    className="category-card__photo"
                    draggable="false"
                  />
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

      </main>

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
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
                </svg>
              </a>
              {/* Facebook */}
              <a href="#" aria-label="Facebook" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
                </svg>
              </a>
              {/* YouTube */}
              <a href="#" aria-label="YouTube" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
                </svg>
              </a>
              {/* TikTok */}
              <a href="#" aria-label="TikTok" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Nav columns */}
          <div className="footer-links-grid">
            <div className="footer-col">
              <h3 className="footer-col__heading">Navigate</h3>
              <ul className="footer-col__list">
                {['Home', 'Upcoming Events', 'Artists', 'Venues', 'Blog'].map(l => (
                  <li key={l}><a href="#" className="footer-link">{l}</a></li>
                ))}
              </ul>
            </div>

            <div className="footer-col">
              <h3 className="footer-col__heading">Connect</h3>
              <ul className="footer-col__list">
                {['List Your Event', 'Become a Partner', 'Press & Media', 'Contact Us', 'Careers'].map(l => (
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

    </div>
  )
}

export default App