import 'server-only'

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/firebase-admin'
import { ApiError, type RequestActor } from '@/lib/server/api-auth'

export const MAX_NOTIFICATION_DEVICES = 5

export async function registerNotificationDevice(actor: RequestActor, fid: unknown, platform: unknown): Promise<void> {
  if (typeof fid !== 'string' || !/^[a-zA-Z0-9_-]{10,256}$/.test(fid)) throw new ApiError(400, 'Mã thiết bị không hợp lệ.')
  if (typeof platform !== 'string' || !platform.length || platform.length > 300) throw new ApiError(400, 'Thông tin thiết bị không hợp lệ.')
  const devices = adminDb.collection('employees').doc(actor.uid).collection('notificationDevices')
  const ref = devices.doc(fid)
  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(ref)
    if (current.exists) {
      const lastSeen = current.get('lastSeenAt')
      // Reopening the app should not create another write on every navigation.
      if (current.get('platform') === platform && lastSeen instanceof Timestamp && Date.now() - lastSeen.toMillis() < 24 * 60 * 60 * 1000) return
    } else {
      const registered = await transaction.get(devices.limit(MAX_NOTIFICATION_DEVICES))
      if (registered.size >= MAX_NOTIFICATION_DEVICES) throw new ApiError(409, 'Tài khoản đã có 5 thiết bị nhận thông báo. Hãy tắt thông báo trên thiết bị cũ trước.')
    }
    const now = FieldValue.serverTimestamp()
    transaction.set(ref, {
      employeeId: actor.uid, fid, platform, permission: 'granted',
      createdAt: current.exists ? current.get('createdAt') : now,
      updatedAt: now, lastSeenAt: now,
    })
  })
}
