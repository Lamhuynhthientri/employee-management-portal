import { NextResponse } from 'next/server'
import { ApiError, authenticateRequest } from '@/lib/server/api-auth'
import { registerNotificationDevice } from '@/lib/server/notification-devices'
import { limitBurst, readJsonBody } from '@/lib/server/request-limits'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const actor = await authenticateRequest(request)
    limitBurst(`devices:${actor.uid}`, 12)
    const body = await readJsonBody(request, 2048)
    await registerNotificationDevice(actor, body.fid, body.platform)
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof ApiError ? error.message : 'Chưa thể đăng ký thiết bị.' }, { status: error instanceof ApiError ? error.status : 500 })
  }
}
