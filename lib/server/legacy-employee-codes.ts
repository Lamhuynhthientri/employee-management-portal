import 'server-only'

import { unstable_cache } from 'next/cache'
import { adminDb } from '@/lib/server/firebase-admin'

// Historical values can contain whitespace, so an exact equality lookup is
// insufficient. Cache only the minimal migration projection, never full profiles.
export const legacyEmployeeCodes = unstable_cache(async () => {
  const snapshot = await adminDb.collection('employees').select('employeeCode').get()
  return snapshot.docs.map((item) => ({ uid: item.id, employeeCode: item.get('employeeCode') }))
}, ['legacy-employee-code-reservations-v1'], { revalidate: 60 })
