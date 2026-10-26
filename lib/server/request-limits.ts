import 'server-only'

import { ApiError } from '@/lib/server/api-error'

// Cheap per-instance burst protection. Durable limits for expensive operations
// live in their own transactions; this is not a global distributed limiter.
const windows = new Map<string, { count: number; until: number }>()
const MAX_KEYS = 4096

export function limitBurst(key: string, maximum = 60, windowMs = 60_000, now = Date.now()): void {
  if (windows.size >= MAX_KEYS) {
    for (const [id, item] of windows) if (item.until <= now) windows.delete(id)
    // Do not evict active counters under a rotating-key attack.
    if (!windows.has(key) && windows.size >= MAX_KEYS) throw new ApiError(429, 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.')
  }
  const current = windows.get(key)
  if (current && current.until > now) {
    if (current.count >= maximum) throw new ApiError(429, 'Bạn thao tác quá nhanh. Vui lòng chờ một phút rồi thử lại.')
    current.count += 1
  } else {
    windows.set(key, { count: 1, until: now + windowMs })
  }
}

/** Limit actual streamed bytes as well as the optional Content-Length header. */
export async function readRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'))
  if (declared > maxBytes) throw new ApiError(413, 'Dữ liệu gửi lên quá lớn.')
  if (!request.body) throw new ApiError(400, 'Dữ liệu gửi lên không hợp lệ.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new ApiError(413, 'Dữ liệu gửi lên quá lớn.')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'Dữ liệu gửi lên không hợp lệ.')
  } finally {
    reader.releaseLock()
  }
}

export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const bytes = await readRequestBytes(request, maxBytes)
  try {
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid object')
    return result as Record<string, unknown>
  } catch { throw new ApiError(400, 'Dữ liệu gửi lên không hợp lệ.') }
}
