import { NextResponse } from 'next/server'
import { ApiError, authenticateRequest } from '@/lib/server/api-auth'
import {
  cancelRequest,
  cancelScheduleBatch,
  adminCancelSchedules,
  restoreAdminCancelledSchedules,
  createForgottenDutyPenalty,
  createManualPenalty,
  managePenalty,
  reviewRequest,
  reviewScheduleBatch,
  getWeeklyScheduleTarget,
  getDutyAvailability,
  normalizeLeaveRequests,
  updateWeeklyScheduleTarget,
  getManagementContact,
  getPushDiagnostics,
  sendTestPush,
  getAuditReceiptSettings,
  updateAuditReceiptSettings,
  manageEmployeeStatus,
  manageEmployeeRole,
  getFactoryManagerSeats,
  setInitialScheduleMode,
  submitScheduleModeChangeRequest,
  submitFactoryChangeRequest,
  ensureFixedSchedule,
  getAccountRegistrationWindow,
  updateAccountRegistrationWindow,
  getUserFeatureSettings,
  updateUserFeatureSetting,
  getSalaryAdvancePolicy,
  updateSalaryAdvancePolicy,
  respondPenaltyConsent,
  replaceSchedules,
  reviseRequest,
  reopenRequest,
  setScheduleBatchEditing,
  submitLate,
  submitLeave,
  submitSalaryAdvance,
  submitStaffRequest,
  submitSchedules,
} from '@/lib/server/workflows'
import { recordCompletedWorkflowAudit, workflowNeedsAudit } from '@/lib/server/audit-trail'
import { dispatchQueuedAuditEmails } from '@/lib/server/audit-email'
import { invalidateMonthDataCache } from '@/lib/server/month-data-cache'
import { getOperationalHealth, reportOperationalFailure, runOperationalHealthNow } from '@/lib/server/operational-health'
import { limitBurst, readJsonBody } from '@/lib/server/request-limits'

export const runtime = 'nodejs'
export const maxDuration = 30

const handlers = {
  submitSchedules,
  replaceSchedules,
  submitLeave,
  submitLate,
  submitSalaryAdvance,
  submitStaffRequest,
  reviseRequest,
  reopenRequest,
  cancelRequest,
  cancelScheduleBatch,
  adminCancelSchedules,
  restoreAdminCancelledSchedules,
  setScheduleBatchEditing,
  createForgottenDutyPenalty,
  createManualPenalty,
  managePenalty,
  reviewRequest,
  reviewScheduleBatch,
  getWeeklyScheduleTarget,
  getDutyAvailability,
  normalizeLeaveRequests,
  updateWeeklyScheduleTarget,
  getManagementContact,
  getPushDiagnostics,
  sendTestPush,
  getAuditReceiptSettings,
  updateAuditReceiptSettings,
  manageEmployeeStatus,
  manageEmployeeRole,
  getFactoryManagerSeats,
  setInitialScheduleMode,
  submitScheduleModeChangeRequest,
  submitFactoryChangeRequest,
  ensureFixedSchedule,
  getAccountRegistrationWindow,
  updateAccountRegistrationWindow,
  getUserFeatureSettings,
  updateUserFeatureSetting,
  getSalaryAdvancePolicy,
  updateSalaryAdvancePolicy,
  respondPenaltyConsent,
  getOperationalHealth,
  runOperationalHealthNow,
} as const

const diagnosticActions = new Set(['getPushDiagnostics', 'sendTestPush', 'getOperationalHealth', 'runOperationalHealthNow'])

const monthDataMutationActions = new Set([
  'submitSchedules',
  'replaceSchedules',
  'submitLeave',
  'submitLate',
  'submitSalaryAdvance',
  'submitStaffRequest',
  'reviseRequest',
  'reopenRequest',
  'cancelRequest',
  'createForgottenDutyPenalty',
  'createManualPenalty',
  'managePenalty',
  'reviewRequest',
  'reviewScheduleBatch',
  'respondPenaltyConsent',
  'manageEmployeeStatus',
  'manageEmployeeRole',
])

function safeServerError(error: unknown): { status: number; message: string } {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message }
  }

  const details = error instanceof Error ? error.message : ''
  if (details.startsWith('Thiếu biến môi trường server ')) {
    return {
      status: 503,
      message: 'Backend chưa cấu hình đủ biến Firebase Admin trên môi trường đang chạy.',
    }
  }

  const normalizedDetails = details.toLowerCase()
  const credentialError = [
    'firebase admin private key không hợp lệ',
    'failed to parse private key',
    'invalid pem formatted message',
    'app/invalid-credential',
    'could not load the default credentials',
    'invalid_grant',
    'invalid jwt signature',
    'failed to fetch a valid google oauth2 access token',
    'credential implementation provided to initializeapp',
  ].some((fragment) => normalizedDetails.includes(fragment))

  if (credentialError) {
    return {
      status: 503,
      message: 'Firebase Admin không xác thực được. Project ID, client email và private key phải lấy cùng một file service account; sau đó redeploy Vercel.',
    }
  }

  const firestorePermissionError =
    normalizedDetails.includes('permission_denied') ||
    normalizedDetails.includes('permission denied') ||
    normalizedDetails.includes('missing or insufficient permissions')

  if (firestorePermissionError) {
    return {
      status: 503,
      message: 'Service account của backend chưa có quyền truy cập Firestore trong project này.',
    }
  }

  const firestoreTargetError =
    normalizedDetails.includes('database (default) does not exist') ||
    normalizedDetails.includes('the database (default) does not exist') ||
    normalizedDetails.includes('project was not found')

  if (firestoreTargetError) {
    return {
      status: 503,
      message: 'Firebase Admin đang trỏ sai project hoặc không tìm thấy Firestore database (default).',
    }
  }

  return {
    status: 500,
    message: 'Backend chưa sẵn sàng hoặc đã xảy ra lỗi máy chủ.',
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticateRequest(request)
    limitBurst(`workflows:${actor.uid}`, 90)
    const body = await readJsonBody(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'Dữ liệu gửi lên không hợp lệ.')
    }
    const { action, ...payload } = body as Record<string, unknown>
    if (typeof action !== 'string' || !Object.hasOwn(handlers, action)) {
      throw new ApiError(400, 'Nghiệp vụ không hợp lệ.')
    }
    if (diagnosticActions.has(action)) limitBurst(`diagnostics:${actor.uid}`, 6)
    const result = await handlers[action as keyof typeof handlers](actor, payload)
    if (monthDataMutationActions.has(action)) invalidateMonthDataCache()
    if (!diagnosticActions.has(action) && workflowNeedsAudit(action, result)) {
      try {
        await recordCompletedWorkflowAudit({ actor, action, payload, result })
        await dispatchQueuedAuditEmails()
      } catch (auditError) {
        // Audit/email is isolated so an integration outage never rolls back a
        // successfully completed employee request.
        console.error('Workflow audit/email error:', auditError)
      }
    }
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const { status, message } = safeServerError(error)
    if (!(error instanceof ApiError)) {
      console.error('Workflow API error:', error)
      const details = error instanceof Error ? error.message.toLowerCase() : ''
      const incident = details.includes('resource_exhausted') || details.includes('quota') || details.includes('429')
        ? { code: 'runtime-resource-exhausted', severity: 'critical' as const, title: 'Firestore đã chạm giới hạn khi nhân viên thao tác' }
        : details.includes('permission_denied') || details.includes('permission denied')
          ? { code: 'runtime-permission-denied', severity: 'warning' as const, title: 'Firestore từ chối quyền khi nhân viên thao tác' }
          : details.includes('unavailable') || details.includes('deadline_exceeded')
            ? { code: 'runtime-unavailable', severity: 'warning' as const, title: 'Firestore tạm thời không phản hồi' }
            : null
      if (incident) {
        await reportOperationalFailure({ service: 'firestore', ...incident, message })
          .catch((alertError) => console.error('Runtime operational alert failed:', alertError))
      }
    }
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
