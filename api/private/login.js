import { kv } from '@vercel/kv'
import {
  json,
  readJsonBody,
  clampLen,
  verifyPassword,
  signSessionToken,
  setCookie,
} from '../_lib.js'

const COOKIE_NAME = 'vg_session'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Method not allowed' })
  }

  const secret = process.env.APP_AUTH_SECRET
  if (!secret) {
    return json(res, 500, { error: 'Missing APP_AUTH_SECRET env var' })
  }

  const hasKvEnv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  if (!hasKvEnv) {
    return json(res, 500, {
      error: 'Storage not configured. In Vercel, add a Redis/KV integration to this project and redeploy.',
    })
  }

  try {
    const body = await readJsonBody(req)
    const cardId = clampLen(body?.cardId ?? '', 80)
    const username = clampLen(body?.username ?? '', 32).trim()
    const password = String(body?.password ?? '')

    if (!cardId) return json(res, 400, { error: 'Missing cardId' })
    if (!username) return json(res, 400, { error: 'Missing username' })
    if (!password) return json(res, 400, { error: 'Missing password' })

    const record = await kv.get(`card:${cardId}`)
    if (!record) return json(res, 404, { error: 'Not found' })

    if (String(record.username).trim() !== username) {
      return json(res, 401, { error: 'Invalid credentials' })
    }

    const ok = verifyPassword(password, record.salt, record.hash)
    if (!ok) return json(res, 401, { error: 'Invalid credentials' })

    const exp = Date.now() + 1000 * 60 * 60 * 24 * 365
    const token = signSessionToken({ cardId, username, exp }, secret)
    setCookie(res, COOKIE_NAME, token, { maxAgeSeconds: 31_536_000 })

    return json(res, 200, { ok: true })
  } catch (e) {
    const msg = String(e?.message || '')
    return json(res, 500, { error: msg ? `Server error: ${msg}` : 'Server error' })
  }
}
