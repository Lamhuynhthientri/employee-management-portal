import 'server-only'

import type { DecodedIdToken } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/firebase-admin'
import { ApiError } from '@/lib/server/api-auth'
import { formatVietnamDate } from '@/lib/archive/retention'

/** Durable budgets are reserved only for image uploads, never ordinary reads. */
export async function claimProfileUpload(token: DecodedIdToken, now = new Date()): Promise<void> {
  const profileRef = adminDb.collection('employees').doc(token.uid)
  const personalRef = adminDb.collection('securityBudgets').doc(`avatar-${token.uid}`)
  const globalRef = adminDb.collection('securityBudgets').doc('avatar-global')
  const registrationRef = adminDb.collection('managementSettings').doc('accountRegistration')
  await adminDb.runTransaction(async (transaction) => {
    const [profile, personal, global] = await Promise.all([
      transaction.get(profileRef), transaction.get(personalRef), transaction.get(globalRef),
    ])
    if (profile.exists) {
      if (!['active', 'pending'].includes(String(profile.get('status')))) throw new ApiError(403, 'Tài khoản không được phép tải ảnh.')
      const validAfter = profile.get('sessionsValidAfter')
      if (typeof validAfter === 'number' && token.auth_time <= validAfter) throw new ApiError(401, 'Vui lòng đăng nhập lại.')
    } else {
      const registration = await transaction.get(registrationRef)
      const closesAt = registration.get('closesAt')
      if (registration.get('isOpen') !== true || !(closesAt instanceof Timestamp) || closesAt.toMillis() <= now.getTime()) {
        throw new ApiError(403, 'Cổng đăng ký đã đóng. Tài khoản chưa có hồ sơ không thể tải ảnh.')
      }
      if (!Number.isFinite(token.auth_time) || now.getTime() / 1000 - token.auth_time > 3600) throw new ApiError(401, 'Vui lòng đăng nhập lại trước khi hoàn thiện hồ sơ.')
    }
    const day = formatVietnamDate(now)
    const personalCount = personal.get('day') === day ? Number(personal.get('count') || 0) : 0
    const totalCount = global.get('day') === day ? Number(global.get('count') || 0) : 0
    const limit = profile.exists && profile.get('status') === 'active' ? 10 : 3
    if (personalCount >= limit || totalCount >= 300) throw new ApiError(429, 'Đã đạt giới hạn đổi ảnh trong ngày. Vui lòng thử lại ngày mai.')
    const lastUpload = personal.get('lastUploadAt')
    if (lastUpload instanceof Timestamp && now.getTime() - lastUpload.toMillis() < 15_000) throw new ApiError(429, 'Vui lòng chờ 15 giây trước khi tải ảnh tiếp theo.')
    transaction.set(personalRef, { day, count: personalCount + 1, lastUploadAt: Timestamp.fromDate(now) })
    transaction.set(globalRef, { day, count: totalCount + 1 })
  })
}
