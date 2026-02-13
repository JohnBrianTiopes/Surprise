import crypto from 'node:crypto'

export function json(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 2_000_000) {
        reject(new Error('Body too large'))
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', () => reject(new Error('Read failed')))
  })
}

export function clampLen(value, maxLen) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

export function isSupportedImageSrc(url) {
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

export function sanitizeCardPayload(decoded) {
  if (!decoded || typeof decoded !== 'object') return null

  const from = clampLen(decoded.from ?? '', 30)
  const to = clampLen(decoded.to ?? '', 30)
  const message = clampLen(decoded.message ?? '', 2000)
  const theme = clampLen(decoded.theme ?? 'rose', 20)
  const secret = clampLen(decoded.secret ?? '', 140)

  const photosRaw = Array.isArray(decoded.photos) ? decoded.photos : []
  const photos = photosRaw
    .slice(0, 6)
    .map((p) => {
      const raw = typeof p?.url === 'string' ? p.url.trim() : ''
      const limit = raw.startsWith('data:image/') ? 280000 : 2000
      const url = clampLen(raw, limit)
      const caption = clampLen(p?.caption ?? '', 60)
      if (!isSupportedImageSrc(url)) return null
      return { url, caption }
    })
    .filter(Boolean)

  if (!from && !to && !message) return null

  return { from, to, message, theme, secret, photos }
}

export function pbkdf2HashPassword(password, saltB64) {
  const salt = saltB64 ? Buffer.from(String(saltB64), 'base64') : crypto.randomBytes(16)
  const hash = crypto.pbkdf2Sync(String(password), salt, 120_000, 32, 'sha256')
  return {
    salt: salt.toString('base64'),
    hash: Buffer.from(hash).toString('base64'),
  }
}

export function verifyPassword(password, saltB64, hashB64) {
  const next = pbkdf2HashPassword(password, saltB64)
  const a = Buffer.from(String(next.hash), 'base64')
  const b = Buffer.from(String(hashB64), 'base64')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function b64UrlFromBuffer(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function bufferFromB64Url(str) {
  const b64 = String(str)
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(String(str).length + ((4 - (String(str).length % 4)) % 4), '=')
  return Buffer.from(b64, 'base64')
}

export function signSessionToken(payload, secret) {
  const body = b64UrlFromBuffer(Buffer.from(JSON.stringify(payload)))
  const sig = crypto.createHmac('sha256', String(secret)).update(body).digest()
  return `${body}.${b64UrlFromBuffer(sig)}`
}

export function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expectedSig = crypto.createHmac('sha256', String(secret)).update(body).digest()
  const gotSig = bufferFromB64Url(sig)
  if (gotSig.length !== expectedSig.length) return null
  if (!crypto.timingSafeEqual(gotSig, expectedSig)) return null
  try {
    const json = bufferFromB64Url(body).toString('utf8')
    const payload = JSON.parse(json)
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

export function parseCookie(header) {
  const out = {}
  const raw = String(header || '')
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=')
    if (i === -1) return
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (!k) return
    out[k] = decodeURIComponent(v)
  })
  return out
}

export function setCookie(res, name, value, { maxAgeSeconds = 31_536_000 } = {}) {
  const secure = process.env.NODE_ENV === 'production'
  const parts = [`${name}=${encodeURIComponent(String(value))}`]
  parts.push(`Path=/`)
  parts.push(`HttpOnly`)
  parts.push(`SameSite=Lax`)
  parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`)
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function getOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}
