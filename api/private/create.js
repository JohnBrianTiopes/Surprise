import { kv } from '@vercel/kv'
import crypto from 'node:crypto'
import {
  json,
  readJsonBody,
  clampLen,
  sanitizeCardPayload,
  pbkdf2HashPassword,
  getOrigin,
} from '../_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Method not allowed' })
  }

  // Vercel KV / Redis integration provides these at runtime.
  // If they are missing, @vercel/kv won't be able to connect.
  const hasKvEnv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  if (!hasKvEnv) {
    return json(res, 500, {
      error: 'Storage not configured. In Vercel, add a Redis/KV integration to this project and redeploy.',
    })
  }

  try {
    const body = await readJsonBody(req)
    const payload = sanitizeCardPayload(body?.payload)
    if (!payload) return json(res, 400, { error: 'Invalid card payload' })

    const username = clampLen(body?.username ?? '', 32)
    const password = String(body?.password ?? '')

    if (username.trim().length < 2) return json(res, 400, { error: 'Username too short' })
    if (password.trim().length < 4) return json(res, 400, { error: 'Password too short' })

    const id = crypto.randomUUID()
    const { salt, hash } = pbkdf2HashPassword(password)

    const record = {
      id,
      createdAt: new Date().toISOString(),
      username: username.trim(),
      salt,
      hash,
      payload,
    }

    const serialized = JSON.stringify(record)
    if (Buffer.byteLength(serialized, 'utf8') > 900_000) {
      return json(res, 413, { error: 'Card too large. Remove photos or reduce size.' })
    }

    await kv.set(`card:${id}`, record)

    const origin = getOrigin(req)
    const url = `${origin}/?id=${encodeURIComponent(id)}`
    return json(res, 200, { id, url })
  } catch (e) {
    const msg = String(e?.message || '')
    if (msg.toLowerCase().includes('body too large')) {
      return json(res, 413, { error: 'Card too large. Remove photos or reduce size.' })
    }
    return json(res, 500, {
      error: msg ? `Server error: ${msg}` : 'Server error',
    })
  }
}
