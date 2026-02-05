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
    if (!from && !to && !message) return null
    return { from, to, message, theme }
  } catch {
    return null
  }
}

const THEMES = [
  { id: 'rose', label: 'Rose' },
  { id: 'candy', label: 'Candy' },
  { id: 'midnight', label: 'Midnight' },
]

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
  const [shareUrl, setShareUrl] = useState(() =>
    buildShareUrl({ to: toName, from: fromName, message, theme })
  )
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  useEffect(() => {
    const payload = {
      to: clampLen(toName, 30),
      from: clampLen(fromName, 30),
      message: clampLen(message, 280),
      theme,
    }
    setShareUrl(buildShareUrl(payload))
  }, [toName, fromName, message, theme])

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
    () => ({ to: clampLen(toName, 30), from: clampLen(fromName, 30), message: clampLen(message, 280), theme }),
    [toName, fromName, message, theme]
  )

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
    showToast('Opened share view')
  }

  function onStartOver() {
    const url = new URL(window.location.href)
    url.searchParams.delete('v')
    window.history.replaceState({}, '', url.toString())
    setMode('create')
    showToast('Create a new one')
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
                <button className="tiny" onClick={() => setMode(mode === 'view' ? 'create' : 'view')}>
                  {mode === 'view' ? 'Edit' : 'Preview'}
                </button>
              </div>
            </div>

            <div className="cardBody">
              <h2 className="toLine">
                {payload.to ? `Dear ${payload.to},` : 'Dear you,'}
              </h2>
              <p className="message">{payload.message || 'You are loved.'}</p>
              <div className="fromLine">
                <span className="fromLabel">—</span>
                <span className="fromName">{payload.from || 'Someone who cares'}</span>
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
