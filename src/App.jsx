import './App.css'

import { useEffect, useMemo, useRef, useState } from 'react'

function bytesToB64Url(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function b64UrlToBytes(encoded) {
  if (!encoded) return new Uint8Array(0)
  const b64 = String(encoded)
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(String(encoded).length + ((4 - (String(encoded).length % 4)) % 4), '=')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function encryptCardPayload(payload, passcode) {
  const code = String(passcode || '').trim()
  if (!code) throw new Error('Missing passcode')
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto unavailable')

  const iterations = 120_000
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const plainBytes = new TextEncoder().encode(JSON.stringify(payload))
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes)
  const cipherBytes = new Uint8Array(cipherBuf)

  return {
    v: 1,
    it: iterations,
    s: bytesToB64Url(salt),
    i: bytesToB64Url(iv),
    c: bytesToB64Url(cipherBytes),
  }
}

async function decryptCardPayload(envelope, passcode) {
  const code = String(passcode || '').trim()
  if (!code) throw new Error('Missing passcode')
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto unavailable')

  const iterations = Number(envelope?.it) || 120_000
  const salt = b64UrlToBytes(envelope?.s)
  const iv = b64UrlToBytes(envelope?.i)
  const cipherBytes = b64UrlToBytes(envelope?.c)
  if (!salt.length || !iv.length || !cipherBytes.length) throw new Error('Invalid envelope')

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes)
  const json = new TextDecoder().decode(new Uint8Array(plainBuf))
  return JSON.parse(json)
}

function clampLen(value, maxLen) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function isSupportedImageSrc(url) {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:image/')) return true
  try {
    const u = new URL(trimmed)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const MAX_PHOTOS = 6
const MAX_SHARE_URL_LEN = 7000
const MAX_MESSAGE_LEN = 2000
const MAX_DATA_IMAGE_URL_LEN = 280000
const MAX_HTTP_IMAGE_URL_LEN = 2000

function clampPhotoUrl(url) {
  const raw = typeof url === 'string' ? url.trim() : ''
  const limit = raw.startsWith('data:image/') ? MAX_DATA_IMAGE_URL_LEN : MAX_HTTP_IMAGE_URL_LEN
  return clampLen(raw, limit)
}

async function fileToCompressedDataUrl(file, { maxDim = 900, quality = 0.78 } = {}) {
  if (!file) throw new Error('No file')
  if (!file.type?.startsWith('image/')) throw new Error('Not an image')

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Read failed'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Image load failed'))
    el.src = dataUrl
  })

  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (!srcW || !srcH) return dataUrl

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const outW = Math.max(1, Math.round(srcW * scale))
  const outH = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, outW, outH)

  // Prefer JPEG for size; keep PNG/GIF only if already small.
  const asJpeg = canvas.toDataURL('image/jpeg', quality)
  return asJpeg.length < dataUrl.length ? asJpeg : dataUrl
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
  url.searchParams.delete('e')
  return url.toString()
}

function buildEncryptedShareUrl(envelope) {
  const url = new URL(window.location.href)
  url.searchParams.set('e', encodePayload(envelope))
  url.searchParams.delete('v')
  url.searchParams.delete('id')
  return url.toString()
}

function getSharedFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)

    const privateId = params.get('id')
    if (privateId) {
      const id = clampLen(privateId, 80)
      if (!id) return { kind: 'private', id: '' }
      return { kind: 'private', id }
    }

    const encrypted = params.get('e')
    if (encrypted) {
      const decoded = decodePayload(encrypted)
      if (!decoded || typeof decoded !== 'object') return { kind: 'encrypted', envelope: null }
      return { kind: 'encrypted', envelope: decoded }
    }
    const plain = params.get('v')
    if (!plain) return null
    const decoded = decodePayload(plain)
    if (!decoded || typeof decoded !== 'object') return null
    return { kind: 'plain', payload: decoded }
  } catch {
    return null
  }
}

function sanitizeCardPayload(decoded) {
  if (!decoded || typeof decoded !== 'object') return null
  const from = clampLen(decoded.from ?? '', 30)
  const to = clampLen(decoded.to ?? '', 30)
  const message = clampLen(decoded.message ?? '', MAX_MESSAGE_LEN)
  const theme = clampLen(decoded.theme ?? 'rose', 20)
  const secret = clampLen(decoded.secret ?? '', 140)
  const photosRaw = Array.isArray(decoded.photos) ? decoded.photos : []
  const photos = photosRaw
    .slice(0, MAX_PHOTOS)
    .map((p) => {
      const url = clampPhotoUrl(p?.url ?? '')
      const caption = clampLen(p?.caption ?? '', 60)
      if (!isSupportedImageSrc(url)) return null
      return { url, caption }
    })
    .filter(Boolean)
  if (!from && !to && !message) return null
  return { from, to, message, theme, secret, photos }
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
  const sharedFromUrl = useMemo(() => getSharedFromUrl(), [])
  const initialPlainPayload = useMemo(() => {
    if (sharedFromUrl?.kind !== 'plain') return null
    return sanitizeCardPayload(sharedFromUrl.payload)
  }, [sharedFromUrl])

  const hasSharedLink = Boolean(sharedFromUrl)
  const isEncryptedLink = sharedFromUrl?.kind === 'encrypted'
  const isPrivateLink = sharedFromUrl?.kind === 'private'

  const [mode, setMode] = useState(hasSharedLink ? 'view' : 'create')
  const [toName, setToName] = useState(initialPlainPayload?.to ?? '')
  const [fromName, setFromName] = useState(initialPlainPayload?.from ?? '')
  const [message, setMessage] = useState(
    initialPlainPayload?.message ??
      "Roses are red,\nViolets are blue,\nI made this little page,\nJust for you."
  )
  const [theme, setTheme] = useState(initialPlainPayload?.theme ?? 'rose')
  const [secret, setSecret] = useState(initialPlainPayload?.secret ?? '')
  const [photos, setPhotos] = useState(initialPlainPayload?.photos ?? [])
  const [passcode, setPasscode] = useState('')

  const [privateUser, setPrivateUser] = useState('')
  const [privatePass, setPrivatePass] = useState('')
  const [privateUrl, setPrivateUrl] = useState('')
  const [privateBusy, setPrivateBusy] = useState(false)

  const [newPhotoCaption, setNewPhotoCaption] = useState('')
  const fileInputRef = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [shareUrl, setShareUrl] = useState(() =>
    hasSharedLink ? window.location.href : buildShareUrl({ to: toName, from: fromName, message, theme, secret, photos })
  )
  const [copied, setCopied] = useState(false)
  const [privateCopied, setPrivateCopied] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const [locked, setLocked] = useState(isEncryptedLink || isPrivateLink)
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockBusy, setUnlockBusy] = useState(false)

  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const sharedExperienceEnabled = hasSharedLink
  const [viewerStep, setViewerStep] = useState(sharedExperienceEnabled ? 'envelope' : 'card')
  const [confettiOn, setConfettiOn] = useState(false)
  const [heartTaps, setHeartTaps] = useState(0)
  const noAreaRef = useRef(null)
  const [noStyle, setNoStyle] = useState(null)
  const [noDodges, setNoDodges] = useState(0)

  useEffect(() => {
    if (mode !== 'create') {
      if (hasSharedLink) setShareUrl(window.location.href)
      return
    }

    let cancelled = false
    const nextPayload = {
      to: clampLen(toName, 30),
      from: clampLen(fromName, 30),
      message: clampLen(message, MAX_MESSAGE_LEN),
      theme,
      secret: clampLen(secret, 140),
      photos: (Array.isArray(photos) ? photos : []).slice(0, 6).map((p) => ({
        url: clampPhotoUrl(p?.url ?? ''),
        caption: clampLen(p?.caption ?? '', 60),
      })),
    }

    ;(async () => {
      const code = String(passcode || '').trim()
      if (!code) {
        const url = buildShareUrl(nextPayload)
        if (!cancelled) setShareUrl(url)
        return
      }

      try {
        const envelope = await encryptCardPayload(nextPayload, code)
        const url = buildEncryptedShareUrl(envelope)
        if (!cancelled) setShareUrl(url)
      } catch {
        const url = buildShareUrl(nextPayload)
        if (!cancelled) setShareUrl(url)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, hasSharedLink, toName, fromName, message, theme, secret, photos, passcode])

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
      message: clampLen(message, MAX_MESSAGE_LEN),
      theme,
      secret: clampLen(secret, 140),
      photos: (Array.isArray(photos) ? photos : []).slice(0, 6).map((p) => ({
        url: clampPhotoUrl(p?.url ?? ''),
        caption: clampLen(p?.caption ?? '', 60),
      })),
    }),
    [toName, fromName, message, theme, secret, photos]
  )

  const shareTooLong = shareUrl.length > MAX_SHARE_URL_LEN

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
    if (shareTooLong) {
      showToast('Link too long — remove photos or compress more')
      return
    }
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
    if (shareTooLong) {
      showToast('Link too long — remove photos or compress more')
      return
    }
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
    if (shareTooLong) {
      showToast('Link too long — remove photos first')
      return
    }
    window.history.replaceState({}, '', new URL(shareUrl).toString())
    setMode('view')
    if (sharedExperienceEnabled) setViewerStep('envelope')
    showToast('Opened share view')
  }

  function onStartOver() {
    const url = new URL(window.location.href)
    url.searchParams.delete('v')
    url.searchParams.delete('e')
    url.searchParams.delete('id')
    window.history.replaceState({}, '', url.toString())
    setMode('create')
    setViewerStep('card')
    setHeartTaps(0)
    setNoStyle(null)
    setNoDodges(0)
    showToast('Create a new one')
  }

  async function onCreatePrivateLink() {
    const username = clampLen(privateUser, 32)
    const password = String(privatePass || '')
    if (username.trim().length < 2) {
      showToast('Username too short')
      return
    }
    if (password.trim().length < 4) {
      showToast('Password too short')
      return
    }
    try {
      setPrivateBusy(true)
      const res = await fetch('/api/private/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, username: username.trim(), password }),
      })
      if (res.status === 404) {
        showToast('Private link needs Vercel deploy (no API here)')
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(data?.error || 'Could not create private link')
        return
      }
      setPrivateUrl(String(data?.url || ''))
      showToast('Private link created')
    } catch {
      showToast('Private links only work on the deployed Vercel site')
    } finally {
      setPrivateBusy(false)
    }
  }

  async function onCopyPrivate() {
    if (!privateUrl) {
      showToast('Create the private link first')
      return
    }
    try {
      await navigator.clipboard.writeText(privateUrl)
      setPrivateCopied(true)
      showToast('Private link copied')
      window.setTimeout(() => setPrivateCopied(false), 1200)
    } catch {
      showToast('Copy failed — select the link and copy it')
    }
  }

  async function onLoginPrivate() {
    if (!isPrivateLink) return
    const cardId = sharedFromUrl?.kind === 'private' ? sharedFromUrl.id : ''
    const username = clampLen(loginUser, 32).trim()
    const password = String(loginPass || '')
    if (!cardId) {
      showToast('Invalid link')
      return
    }
    if (!username) {
      showToast('Enter username')
      return
    }
    if (!password) {
      showToast('Enter password')
      return
    }

    try {
      setLoginBusy(true)
      const loginRes = await fetch('/api/private/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, username, password }),
      })
      if (loginRes.status === 404) {
        showToast('Private link needs Vercel deploy (no API here)')
        return
      }
      const loginData = await loginRes.json().catch(() => null)
      if (!loginRes.ok) {
        showToast(loginData?.error || 'Login failed')
        return
      }

      const cardRes = await fetch(`/api/private/card?id=${encodeURIComponent(cardId)}`)
      if (cardRes.status === 404) {
        showToast('Private link needs Vercel deploy (no API here)')
        return
      }
      const cardData = await cardRes.json().catch(() => null)
      if (!cardRes.ok) {
        showToast(cardData?.error || 'Could not load card')
        return
      }

      const sanitized = sanitizeCardPayload(cardData?.payload)
      if (!sanitized) {
        showToast('Could not open this link')
        return
      }

      setToName(sanitized.to)
      setFromName(sanitized.from)
      setMessage(sanitized.message)
      setTheme(sanitized.theme)
      setSecret(sanitized.secret)
      setPhotos(sanitized.photos)
      setLocked(false)
      setViewerStep('envelope')
      showToast('Opened')
    } catch {
      showToast('Private links only work on the deployed Vercel site')
    } finally {
      setLoginBusy(false)
    }
  }

  async function onUnlock() {
    if (!isEncryptedLink) return
    const code = String(unlockCode || '').trim()
    if (!code) {
      showToast('Enter the passcode')
      return
    }
    try {
      setUnlockBusy(true)
      const envelope = sharedFromUrl?.kind === 'encrypted' ? sharedFromUrl.envelope : null
      const decoded = await decryptCardPayload(envelope, code)
      const sanitized = sanitizeCardPayload(decoded)
      if (!sanitized) {
        showToast('Could not open this link')
        return
      }
      setToName(sanitized.to)
      setFromName(sanitized.from)
      setMessage(sanitized.message)
      setTheme(sanitized.theme)
      setSecret(sanitized.secret)
      setPhotos(sanitized.photos)
      setLocked(false)
      setViewerStep('envelope')
      showToast('Unlocked')
    } catch {
      showToast('Wrong passcode')
    } finally {
      setUnlockBusy(false)
    }
  }

  function onOpenEnvelope() {
    const hasPhotos = Array.isArray(payload.photos) && payload.photos.length > 0
    setViewerStep(hasPhotos ? 'reveal' : 'question')
    setHeartTaps(0)
    setNoStyle(null)
    setNoDodges(0)
    showToast('Okay… one question first')
  }

  function onContinueAfterReveal() {
    setViewerStep('question')
    showToast('One quick question…')
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

  function onAddPhoto() {
    if ((Array.isArray(photos) ? photos.length : 0) >= MAX_PHOTOS) {
      showToast('Max 6 photos')
      return
    }
    if (photoBusy) return
    fileInputRef.current?.click?.()
  }

  async function onAddFromDevice(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const name = String(file.name || '').toLowerCase()
      const type = String(file.type || '').toLowerCase()
      if (type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) {
        showToast('HEIC photos may not work here — choose JPG/PNG')
        return
      }
      if ((Array.isArray(photos) ? photos.length : 0) >= MAX_PHOTOS) {
        showToast('Max 6 photos')
        return
      }
      setPhotoBusy(true)
      showToast('Compressing photo…')
      const dataUrl = await fileToCompressedDataUrl(file, { maxDim: 900, quality: 0.78 })
      setPhotos((list) => {
        const next = Array.isArray(list) ? [...list] : []
        if (next.length >= MAX_PHOTOS) return next
        next.push({ url: dataUrl, caption: clampLen(newPhotoCaption, 60) })
        return next
      })
      setNewPhotoCaption('')
      showToast('Photo added from device')
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.toLowerCase().includes('image load failed')) {
        showToast('That image type may not be supported — try JPG/PNG')
      } else {
        showToast('Could not add photo')
      }
    } finally {
      setPhotoBusy(false)
    }
  }

  function onRemovePhoto(idx) {
    setPhotos((list) => (Array.isArray(list) ? list.filter((_, i) => i !== idx) : []))
    showToast('Photo removed')
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

      <main className={mode === 'view' ? 'layout layoutSingle' : 'layout'}>
        {mode === 'create' ? (
        <section className="panel">
          <div className="panelHeader">
            <h1 className="h1">Make a Valentine</h1>
            <p className="muted">
              Fill this in, then copy the link. Add a passcode if you want it locked.
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

            <div className="field">
              <div className="labelRow">
                <span>Photo album (shows when envelope opens)</span>
                <span className="hint">{Array.isArray(photos) ? photos.length : 0}/6</span>
              </div>

              <div className="photoComposer">
                <input
                  value={newPhotoCaption}
                  onChange={(e) => setNewPhotoCaption(e.target.value)}
                  placeholder="Caption (optional)"
                  maxLength={60}
                  autoComplete="off"
                />
                <input
                  ref={fileInputRef}
                  className="fileInput"
                  type="file"
                  accept="image/*"
                  onChange={onAddFromDevice}
                />
                <button
                  className="secondary"
                  type="button"
                  onClick={onAddPhoto}
                  disabled={photoBusy || (Array.isArray(photos) ? photos.length : 0) >= 6}
                >
                  {photoBusy ? 'Working…' : 'Add photo'}
                </button>
              </div>

              {Array.isArray(photos) && photos.length ? (
                <div className="photoList">
                  {photos.map((p, idx) => (
                    <div className="photoItem" key={`${p.url}-${idx}`}>
                      <div className="photoThumb">
                        <img src={p.url} alt={p.caption || 'Photo'} loading="lazy" />
                      </div>
                      <div className="photoMeta">
                        <div className="photoUrl" title={p.url}>{p.url}</div>
                        <div className="photoCaption">{p.caption || '—'}</div>
                      </div>
                      <button className="ghost" type="button" onClick={() => onRemovePhoto(idx)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="miniInfo">Tip: picking a photo embeds it into the share link (bigger photos = longer link).</div>
              )}
            </div>

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
                <span className="hint">{message.trim().length}/{MAX_MESSAGE_LEN}</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={MAX_MESSAGE_LEN}
                placeholder="Write something sweet…"
              />
            </label>

            <label className="field">
              <div className="labelRow">
                <span>Passcode (optional)</span>
                <span className="hint">Locks the link</span>
              </div>
              <input
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Send this separately (text/DM)"
                autoComplete="off"
              />
              <div className="miniInfo">
                If you set a passcode, the letter is encrypted. Anyone with the link will still need the passcode to open it.
              </div>
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
              {shareTooLong ? (
                <div className="miniInfo">
                  Link is too long to reliably share. Remove photos or use fewer/smaller ones.
                </div>
              ) : null}
              <div className="shareHints">
                <button className="link" type="button" onClick={onOpenViewer}>
                  Open the shared view
                </button>
              </div>
            </div>

            <div className="shareBox">
              <div className="shareLabel">Private link (only with login)</div>
              <div className="miniInfo">This stores the letter on the server. The URL won’t contain the message.</div>

              <div className="shareRow" style={{ marginTop: 10 }}>
                <input
                  value={privateUser}
                  onChange={(e) => setPrivateUser(e.target.value)}
                  placeholder="Username for them"
                  autoComplete="off"
                />
                <input
                  value={privatePass}
                  onChange={(e) => setPrivatePass(e.target.value)}
                  placeholder="Password for them"
                  autoComplete="off"
                  type="password"
                />
              </div>

              <div className="photoActions" style={{ marginTop: 10 }}>
                <button className="primary" type="button" onClick={onCreatePrivateLink} disabled={privateBusy}>
                  {privateBusy ? 'Creating…' : 'Create private link'}
                </button>
              </div>

              {privateUrl ? (
                <div className="shareRow" style={{ marginTop: 10 }}>
                  <input value={privateUrl} readOnly onFocus={(e) => e.target.select()} />
                  <button className={privateCopied ? 'success' : 'secondary'} onClick={onCopyPrivate}>
                    {privateCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
        ) : null}

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

            {mode === 'view' && sharedExperienceEnabled && !locked ? (
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

                {viewerStep === 'reveal' ? (
                  <div className="revealStage">
                    <div className="revealTitle">A little photo surprise ✨</div>
                    <div className="revealGrid">
                      {(payload.photos || []).slice(0, 6).map((p, idx) => (
                        <figure className="polaroid" key={`${p.url}-${idx}`}>
                          <img src={p.url} alt={p.caption || `Photo ${idx + 1}`} loading="lazy" />
                          <figcaption>{p.caption || ' '}</figcaption>
                        </figure>
                      ))}
                    </div>
                    <div className="revealActions">
                      <button className="primary" onClick={onContinueAfterReveal}>
                        Continue
                      </button>
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
              {mode === 'view' && locked ? (
                <div className="shareBox">
                  <div className="shareLabel">This Valentine is locked</div>

                  {isEncryptedLink ? (
                    <>
                      <div className="miniInfo">Enter the passcode to open the letter.</div>
                      <div className="shareRow" style={{ marginTop: 10 }}>
                        <input
                          value={unlockCode}
                          onChange={(e) => setUnlockCode(e.target.value)}
                          placeholder="Passcode"
                          autoComplete="off"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onUnlock()
                          }}
                        />
                        <button className="primary" onClick={onUnlock} disabled={unlockBusy}>
                          {unlockBusy ? 'Opening…' : 'Open'}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {isPrivateLink ? (
                    <>
                      <div className="miniInfo">Enter the username + password to open the letter.</div>
                      <div className="shareRow" style={{ marginTop: 10 }}>
                        <input
                          value={loginUser}
                          onChange={(e) => setLoginUser(e.target.value)}
                          placeholder="Username"
                          autoComplete="off"
                        />
                        <input
                          value={loginPass}
                          onChange={(e) => setLoginPass(e.target.value)}
                          placeholder="Password"
                          type="password"
                          autoComplete="off"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onLoginPrivate()
                          }}
                        />
                      </div>
                      <div className="photoActions" style={{ marginTop: 10 }}>
                        <button className="primary" onClick={onLoginPrivate} disabled={loginBusy}>
                          {loginBusy ? 'Opening…' : 'Open'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <h2 className="toLine">
                {payload.to ? `Dear ${payload.to},` : 'Dear you,'}
              </h2>
              <p className="message">{payload.message || 'You are loved.'}</p>
              <div className="fromLine">
                <span className="fromLabel">—</span>
                <span className="fromName">{payload.from || 'Someone who cares'}</span>
              </div>

              {Array.isArray(payload.photos) && payload.photos.length ? (
                <div className="photoStrip" aria-label="Photos">
                  {payload.photos.slice(0, 6).map((p, idx) => (
                    <button
                      key={`${p.url}-${idx}`}
                      type="button"
                      className="photoMini"
                      onClick={() => {
                        showToast(p.caption || `Photo ${idx + 1}`)
                      }}
                      title={p.caption || `Photo ${idx + 1}`}
                    >
                      <img src={p.url} alt={p.caption || `Photo ${idx + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : null}

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
                Tip: the card lives in the URL. Add a passcode to lock it.
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
