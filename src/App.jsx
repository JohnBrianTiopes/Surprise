import './App.css'

import { useEffect, useMemo, useRef, useState } from 'react'

function clampLen(value, maxLen) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function encodePayload(payload) {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decodePayload(encoded) {
  if (!encoded) return null
  const b64 = encoded
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), '=')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const json = new TextDecoder().decode(bytes)
  return JSON.parse(json)
}

function buildShareUrl(payload) {
  const url = new URL(window.location.href)
  url.searchParams.set('v', encodePayload(payload))
  return url.toString()
}

function getInitialFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const encoded = params.get('v')
    const decoded = decodePayload(encoded)
    if (!decoded || typeof decoded !== 'object') return null

    const from = clampLen(decoded.from ?? '', 30)
    const to = clampLen(decoded.to ?? '', 30)
    const message = clampLen(decoded.message ?? '', 280)
    const theme = clampLen(decoded.theme ?? 'rose', 20)
    const secret = clampLen(decoded.secret ?? '', 140)
    if (!from && !to && !message) return null
    return { from, to, message, theme, secret }
  } catch {
    return null
  }
}

const THEMES = [
  { id: 'rose', label: 'Rose' },
  { id: 'candy', label: 'Candy' },
  { id: 'midnight', label: 'Midnight' },
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function daysUntilNextValentines() {
  const now = new Date()
  const year = now.getMonth() > 1 || (now.getMonth() === 1 && now.getDate() > 14) ? now.getFullYear() + 1 : now.getFullYear()
  const target = new Date(year, 1, 14, 0, 0, 0)
  const diffMs = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

function seededPercent(a, b) {
  const s = `${(a || '').trim().toLowerCase()}|${(b || '').trim().toLowerCase()}`
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const n = (h >>> 0) % 101
  return n
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, now)
    out.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.65)
    out.connect(ctx.destination)

    const freqs = [523.25, 659.25, 783.99] // C5 E5 G5
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, now)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.14 / (idx + 1), now + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
      osc.connect(g)
      g.connect(out)
      osc.start(now)
      osc.stop(now + 0.62)
    })

    window.setTimeout(() => {
      ctx.close?.()
    }, 900)
  } catch {
    // ignore
  }
}

function App() {
  const initialShared = useMemo(() => getInitialFromUrl(), [])
  const [mode, setMode] = useState(initialShared ? 'view' : 'create')
  const [toName, setToName] = useState(initialShared?.to ?? '')
  const [fromName, setFromName] = useState(initialShared?.from ?? '')
  const [message, setMessage] = useState(
    initialShared?.message ??
      "Roses are red,\nViolets are blue,\nI made this little page,\nJust for you."
  )
  const [theme, setTheme] = useState(initialShared?.theme ?? 'rose')
  const [secret, setSecret] = useState(initialShared?.secret ?? '')
  const [soundOn, setSoundOn] = useState(false)
  const [shareUrl, setShareUrl] = useState(() =>
    buildShareUrl({ to: toName, from: fromName, message, theme, secret })
  )
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const sharedExperienceEnabled = Boolean(initialShared)
  const [viewerStep, setViewerStep] = useState(sharedExperienceEnabled ? 'envelope' : 'card')
  const [confettiOn, setConfettiOn] = useState(false)
  const [heartTaps, setHeartTaps] = useState(0)
  const noAreaRef = useRef(null)
  const [noStyle, setNoStyle] = useState(null)
  const [noDodges, setNoDodges] = useState(0)

  useEffect(() => {
    const payload = {
      to: clampLen(toName, 30),
      from: clampLen(fromName, 30),
      message: clampLen(message, 280),
      theme,
      secret: clampLen(secret, 140),
    }
    setShareUrl(buildShareUrl(payload))
  }, [toName, fromName, message, theme, secret])

  useEffect(() => {
    const titleBase = toName ? `A Valentine for ${toName}` : 'A Valentine'
    document.title = `${titleBase} — Surprise Gift`
  }, [toName])

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  const payload = useMemo(
    () => ({
      to: clampLen(toName, 30),
      from: clampLen(fromName, 30),
      message: clampLen(message, 280),
      theme,
      secret: clampLen(secret, 140),
    }),
    [toName, fromName, message, theme, secret]
  )

  const daysLeft = useMemo(() => daysUntilNextValentines(), [])
  const lovePercent = useMemo(() => seededPercent(payload.from, payload.to), [payload.from, payload.to])
  const unlockedSecret = heartTaps >= 7

  const confettiPieces = useMemo(() => {
    const count = prefersReducedMotion() ? 0 : 36
    return Array.from({ length: count }).map((_, i) => {
      const left = Math.round(Math.random() * 100)
      const delay = Math.random() * 0.35
      const dur = 1.2 + Math.random() * 0.9
      const rotate = Math.round(Math.random() * 360)
      const hue = (i * 23) % 360
      const size = 6 + Math.round(Math.random() * 6)
      return { left, delay, dur, rotate, hue, size }
    })
  }, [confettiOn])

  function showToast(text) {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      showToast('Link copied')
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      showToast('Copy failed — you can select the link and copy it')
    }
  }

  async function onShare() {
    if (!navigator.share) {
      showToast('Sharing not supported here — copy the link instead')
      return
    }
    try {
      await navigator.share({
        title: 'A Valentine for you',
        text: payload.to ? `A Valentine for ${payload.to}` : 'A Valentine for you',
        url: shareUrl,
      })
    } catch {
      // user canceled or share failed
    }
  }

  function onOpenViewer() {
    window.history.replaceState({}, '', new URL(shareUrl).toString())
    setMode('view')
    if (sharedExperienceEnabled) setViewerStep('envelope')
    showToast('Opened share view')
  }

  function onStartOver() {
    const url = new URL(window.location.href)
    url.searchParams.delete('v')
    window.history.replaceState({}, '', url.toString())
    setMode('create')
    setViewerStep('card')
    setHeartTaps(0)
    setNoStyle(null)
    setNoDodges(0)
    showToast('Create a new one')
  }

  function onOpenEnvelope() {
    setViewerStep('question')
    setHeartTaps(0)
    setNoStyle(null)
    setNoDodges(0)
    showToast('Okay… one question first')
  }

  function dodgeNo() {
    const el = noAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 10
    const x = Math.max(pad, Math.floor(Math.random() * (rect.width - 120 - pad)))
    const y = Math.max(pad, Math.floor(Math.random() * (rect.height - 56 - pad)))
    setNoStyle({ left: `${x}px`, top: `${y}px` })
    setNoDodges((n) => n + 1)
  }

  function onYes() {
    setViewerStep('card')
    setConfettiOn(true)
    if (soundOn) playChime()
    window.setTimeout(() => setConfettiOn(false), 1400)
    showToast('Yay!')
  }

  return (
    <div className={`page theme-${theme}`}>
      <div className="bg-hearts" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">❤</div>
          <div className="brandText">
            <div className="brandTitle">Surprise Gift</div>
            <div className="brandSub">Valentine link you can share</div>
          </div>
        </div>

        <div className="topActions">
          <button className="ghost" onClick={onStartOver}>
            Create
          </button>
          <button
            className={soundOn ? 'secondary' : 'ghost'}
            onClick={() => {
              setSoundOn((s) => !s)
              showToast(!soundOn ? 'Sound on' : 'Sound off')
            }}
            title="Toggle sound"
          >
            {soundOn ? 'Sound: On' : 'Sound: Off'}
          </button>
          <button className="primary" onClick={onShare}>
            Share
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panelHeader">
            <h1 className="h1">Make a Valentine</h1>
            <p className="muted">
              Fill this in, then copy the link. Anyone can open it.
            </p>
          </div>

          <div className="form">
            <label className="field">
              <div className="labelRow">
                <span>To</span>
                <span className="hint">{toName.trim().length}/30</span>
              </div>
              <input
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="Name (e.g., Alex)"
                maxLength={30}
                autoComplete="off"
              />
            </label>

            <label className="field">
              <div className="labelRow">
                <span>Secret (unlocks after 7 taps)</span>
                <span className="hint">{secret.trim().length}/140</span>
              </div>
              <input
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Optional hidden note…"
                maxLength={140}
                autoComplete="off"
              />
            </label>

            <label className="field">
              <div className="labelRow">
                <span>From</span>
                <span className="hint">{fromName.trim().length}/30</span>
              </div>
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your name"
                maxLength={30}
                autoComplete="off"
              />
            </label>

            <label className="field">
              <div className="labelRow">
                <span>Message</span>
                <span className="hint">{message.trim().length}/280</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={280}
                placeholder="Write something sweet…"
              />
            </label>

            <div className="field">
              <div className="labelRow">
                <span>Theme</span>
              </div>
              <div className="themeRow" role="radiogroup" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={t.id === theme ? 'chip chipActive' : 'chip'}
                    onClick={() => setTheme(t.id)}
                    aria-checked={t.id === theme}
                    role="radio"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="shareBox">
              <div className="shareLabel">Your share link</div>
              <div className="shareRow">
                <input value={shareUrl} readOnly onFocus={(e) => e.target.select()} />
                <button className={copied ? 'success' : 'secondary'} onClick={onCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="shareHints">
                <button className="link" type="button" onClick={onOpenViewer}>
                  Open the shared view
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="cardWrap">
          <article className={mode === 'view' ? 'card cardPop' : 'card'}>
            <div className="cardTop">
              <div className="badge">❤ Valentine ❤</div>
              <div className="miniActions">
                <button
                  className="tiny"
                  onClick={() => {
                    if (mode === 'view') {
                      setMode('create')
                      showToast('Editing')
                      return
                    }
                    setMode('view')
                    setViewerStep(sharedExperienceEnabled ? 'envelope' : 'card')
                    showToast('Preview')
                  }}
                >
                  {mode === 'view' ? 'Edit' : 'Preview'}
                </button>
              </div>
            </div>

            {mode === 'view' && sharedExperienceEnabled ? (
              <div className="experience">
                {confettiOn ? (
                  <div className="confetti" aria-hidden="true">
                    {confettiPieces.map((p, idx) => (
                      <span
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        className="confettiPiece"
                        style={{
                          left: `${p.left}%`,
                          animationDelay: `${p.delay}s`,
                          animationDuration: `${p.dur}s`,
                          transform: `rotate(${p.rotate}deg)`,
                          background: `hsl(${p.hue} 95% 65%)`,
                          width: `${p.size}px`,
                          height: `${Math.max(8, p.size + 4)}px`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}

                {viewerStep === 'envelope' ? (
                  <div className="envelopeStage">
                    <button className="envelope" onClick={onOpenEnvelope}>
                      <span className="envTop" aria-hidden="true" />
                      <span className="envBody" aria-hidden="true" />
                      <span className="envSeal" aria-hidden="true">❤</span>
                      <span className="envText">
                        Tap to open
                      </span>
                    </button>
                    <div className="miniInfo">
                      {daysLeft === 0 ? 'Happy Valentine’s Day!' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} until Valentine’s Day`}
                    </div>
                  </div>
                ) : null}

                {viewerStep === 'question' ? (
                  <div className="questionStage">
                    <div className="questionTitle">
                      {payload.to ? `${payload.to}, will you be my Valentine?` : 'Will you be my Valentine?'}
                    </div>
                    <div className="meter" aria-label={`Love meter ${lovePercent} percent`}>
                      <div className="meterBar" style={{ width: `${lovePercent}%` }} />
                      <div className="meterText">Love meter: {lovePercent}%</div>
                    </div>

                    <div className="noArea" ref={noAreaRef}>
                      <button className="primary" onClick={onYes}>
                        Yes
                      </button>
                      <button
                        className="secondary noBtn"
                        onMouseEnter={dodgeNo}
                        onFocus={dodgeNo}
                        onClick={dodgeNo}
                        style={noStyle ?? undefined}
                      >
                        No
                      </button>
                    </div>
                    <div className="miniInfo">
                      {noDodges >= 3 ? 'The “No” button is shy.' : 'Try clicking “No”… if you can.'}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="cardBody">
              <h2 className="toLine">
                {payload.to ? `Dear ${payload.to},` : 'Dear you,'}
              </h2>
              <p className="message">{payload.message || 'You are loved.'}</p>
              <div className="fromLine">
                <span className="fromLabel">—</span>
                <span className="fromName">{payload.from || 'Someone who cares'}</span>
              </div>

              <div className="secretWrap">
                <button
                  className="heartTap"
                  onClick={() => setHeartTaps((n) => n + 1)}
                  title="Tap the heart"
                >
                  ❤
                </button>
                <div className="secretText">
                  {unlockedSecret
                    ? (payload.secret || 'P.S. You’re my favorite notification.')
                    : `Tap the heart to unlock a secret (${Math.min(7, heartTaps)}/7)`}
                </div>
              </div>
            </div>

            <div className="cardBottom">
              <div className="smallMuted">
                Tip: this card lives in the URL, no login.
              </div>
              <div className="ctaRow">
                <button className="secondary" onClick={onCopy}>
                  Copy link
                </button>
                <button className="primary" onClick={onShare}>
                  Share
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

export default App
