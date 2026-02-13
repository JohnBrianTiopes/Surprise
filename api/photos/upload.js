import { put } from '@vercel/blob'
import Busboy from 'busboy'

import { json } from '../_lib.js'

function randomId() {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { error: 'Method not allowed' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return json(res, 500, {
      error: 'Missing Vercel Blob config (BLOB_READ_WRITE_TOKEN). Enable Vercel Blob in your project settings.',
    })
  }

  const contentType = String(req.headers['content-type'] || '')
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json(res, 400, { error: 'Expected multipart/form-data' })
  }

  try {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 6_000_000, files: 1 } })

    const fileBuffer = await new Promise((resolve, reject) => {
      let done = false
      let chunks = []
      let total = 0
      let meta = { filename: 'photo.jpg', mimeType: 'image/jpeg' }

      busboy.on('file', (name, file, info) => {
        meta = {
          filename: info?.filename || 'photo.jpg',
          mimeType: info?.mimeType || 'application/octet-stream',
        }
        file.on('data', (d) => {
          if (done) return
          chunks.push(d)
          total += d.length
        })
        file.on('limit', () => {
          done = true
          reject(new Error('File too large'))
        })
        file.on('error', () => {
          done = true
          reject(new Error('Upload failed'))
        })
        file.on('end', () => {
          // ok
        })
      })

      busboy.on('error', () => reject(new Error('Upload failed')))
      busboy.on('finish', () => {
        if (done) return
        if (!total) {
          reject(new Error('Missing file'))
          return
        }
        resolve({ meta, buffer: Buffer.concat(chunks) })
      })

      req.pipe(busboy)
    })

    const safeExt = (() => {
      const mt = String(fileBuffer.meta?.mimeType || '').toLowerCase()
      if (mt.includes('png')) return 'png'
      if (mt.includes('webp')) return 'webp'
      if (mt.includes('gif')) return 'gif'
      return 'jpg'
    })()

    const path = `valentines/${Date.now()}-${randomId()}.${safeExt}`

    const blob = await put(path, fileBuffer.buffer, {
      access: 'public',
      contentType: fileBuffer.meta?.mimeType || 'application/octet-stream',
      token,
    })

    return json(res, 200, { url: blob.url })
  } catch (err) {
    const msg = String(err?.message || '')
    if (msg.toLowerCase().includes('too large')) {
      return json(res, 413, { error: 'Photo too large. Try a smaller image.' })
    }
    return json(res, 500, { error: 'Could not upload photo' })
  }
}
