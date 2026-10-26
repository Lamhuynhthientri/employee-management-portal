import 'server-only'

import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminAuth, adminDb } from '@/lib/server/firebase-admin'
import { isFactoryId, type FactoryId } from '@/lib/models/factory'
import { ApiError } from '@/lib/server/api-error'
import { limitBurst } from '@/lib/server/request-limits'
export { ApiError } from '@/lib/server/api-error'

export type AppRole = 'admin' | 'manager' | 'director' | 'employee'

export interface RequestActor {
  token: DecodedIdToken
  uid: string
  role: AppRole
  factoryId: FactoryId
}

export async function authenticateRequest(request: Request): Promise<RequestActor> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(401, 'Bạn cần đăng nhập để thực hiện thao tác này.')
  }

  let token: DecodedIdToken
  try {
    token = await adminAuth.verifyIdToken(authorization.slice(7), true)
  } catch {
    throw new ApiError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
  }

  limitBurst(`api:${token.uid}`, 180)
  const profile = await adminDb.collection('employees').doc(token.uid).get()
  if (!profile.exists) {
    throw new ApiError(403, 'Tài khoản chưa có hồ sơ nhân viên.')
  }

  const role = profile.get('role')
  if (!['admin', 'manager', 'director', 'employee'].includes(role)) {
    throw new ApiError(403, 'Tài khoản không hoạt động hoặc chưa được phân quyền.')
  }

  if (profile.get('status') !== 'active') {
    throw new ApiError(403, profile.get('status') === 'inactive'
      ? 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản lý.'
      : 'Hồ sơ đang chờ admin duyệt. Tiện ích sẽ mở sau khi được chấp nhận.')
  }

  const sessionsValidAfter = profile.get('sessionsValidAfter')
  if (typeof sessionsValidAfter === 'number' && token.auth_time <= sessionsValidAfter) {
    throw new ApiError(401, 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.')
  }

  const rawFactoryId = profile.get('factoryId')
  return {
    token,
    uid: token.uid,
    role: role as AppRole,
    factoryId: isFactoryId(rawFactoryId) ? rawFactoryId : 'factory-1',
  }
}

export function requireStaff(actor: RequestActor): void {
  if (!['employee', 'manager', 'director', 'admin'].includes(actor.role)) {
    throw new ApiError(403, 'Bạn không có quyền gửi yêu cầu.')
  }
}

export function requireManager(actor: RequestActor): void {
  if (!['manager', 'director', 'admin'].includes(actor.role)) {
    throw new ApiError(403, 'Chỉ quản lý hoặc admin được xử lý yêu cầu.')
  }
}

export function requireHost(actor: RequestActor): void {
  if (actor.role !== 'director') throw new ApiError(403, 'Chỉ Host được thực hiện thao tác toàn hệ thống.')
}
