import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/firebase-admin'

export const runtime = 'nodejs'

let windowRequest: { expires: number; promise: Promise<{ isOpen: boolean; closesAt: string | null }> } | undefined

export async function GET() {
  if (!windowRequest || Date.now() >= windowRequest.expires) {
    const promise = adminDb.collection('managementSettings').doc('accountRegistration').get().then((snapshot) => {
      const closesAt = snapshot.get('closesAt')
      const date = closesAt instanceof Timestamp ? closesAt.toDate() : null
      return { isOpen: snapshot.get('isOpen') === true, closesAt: date?.toISOString() || null }
    })
    windowRequest = { expires: Date.now() + 15_000, promise }
    promise.catch(() => { if (windowRequest?.promise === promise) windowRequest = undefined })
  }
  try {
    const value = await windowRequest.promise
    return NextResponse.json({ ...value, isOpen: value.isOpen && !!value.closesAt && new Date(value.closesAt).getTime() > Date.now() }, {
      headers: { 'cache-control': 'public, max-age=0, s-maxage=15' },
    })
  } catch {
    return NextResponse.json({ isOpen: false, closesAt: null }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
