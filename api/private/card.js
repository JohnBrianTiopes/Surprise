import { kv } from '@vercel/kv'
import {
  json,
  clampLen,
  parseCookie,
  verifySessionToken,
} from '../_lib.js'

const COOKIE_NAME = 'vg_session'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { error: 'Method not allowed' })
  }

  const secret = process.env.APP_AUTH_SECRET
  if (!secret) {
    return json(res, 500, { error: 'Missing APP_AUTH_SECRET env var' })
  }

  try {
    const url = new URL(req.url, 'http://localhost')
    const id = clampLen(url.searchParams.get('id') ?? '', 80)
    if (!id) return json(res, 400, { error: 'Missing id' })

    const cookies = parseCookie(req.headers.cookie)
    const token = cookies[COOKIE_NAME]
    const session = verifySessionToken(token, secret)
    if (!session || session.cardId !== id || !session.exp || Date.now() > Number(session.exp)) {
      return json(res, 401, { error: 'Unauthorized' })
    }

    const record = await kv.get(`card:${id}`)
    if (!record) return json(res, 404, { error: 'Not found' })

    return json(res, 200, { payload: record.payload })
  } catch {
    return json(res, 500, { error: 'Server error' })
  }
}
