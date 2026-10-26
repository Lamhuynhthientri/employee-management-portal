import 'server-only'

import { randomUUID } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/firebase-admin'
import { ApiError } from '@/lib/server/api-auth'

export async function withJobLease<T>(job: string, work: () => Promise<T>): Promise<T> {
  const ref = adminDb.collection('systemJobLocks').doc(job)
  const owner = randomUUID()
  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(ref)
    const until = current.get('until')
    if (until instanceof Timestamp && until.toMillis() > Date.now()) throw new ApiError(409, 'Tác vụ đang chạy. Vui lòng chờ hoàn tất.')
    transaction.set(ref, { owner, until: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000) })
  })
  try { return await work() }
  finally {
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(ref)
      if (current.get('owner') === owner) transaction.delete(ref)
    }).catch(() => console.error('Could not release job lease; it will expire automatically.'))
  }
}
