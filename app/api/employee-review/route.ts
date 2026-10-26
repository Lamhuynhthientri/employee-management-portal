import { NextResponse } from 'next/server'
import { ApiError, authenticateRequest, requireManager } from '@/lib/server/api-auth'
import { buildEmployeeReviewContext } from '@/lib/server/employee-review'
import { limitBurst, readJsonBody } from '@/lib/server/request-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const actor = await authenticateRequest(request)
    requireManager(actor)
    limitBurst(`review:${actor.uid}`, 12)
    const body = await readJsonBody(request, 2048)
    if (typeof body.employeeId !== 'string' || !/^[^\s/]{1,128}$/.test(body.employeeId)) {
      throw new ApiError(400, 'Nhân viên cần kiểm tra không hợp lệ.')
    }
    if (typeof body.referenceDate !== 'string') throw new ApiError(400, 'Ngày tham chiếu không hợp lệ.')
    const referenceDate = new Date(body.referenceDate)
    if (Number.isNaN(referenceDate.getTime())) throw new ApiError(400, 'Ngày tham chiếu không hợp lệ.')

    const result = await buildEmployeeReviewContext(body.employeeId, referenceDate, actor)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500
    if (!(error instanceof ApiError)) console.error('Employee review failed:', error)
    const technicalMessage = error instanceof Error ? error.message : ''
    const publicMessage = technicalMessage.includes('index')
      ? 'Dữ liệu đánh giá đang chờ hoàn tất chỉ mục Firebase. Vui lòng thử lại sau ít phút.'
      : technicalMessage.includes('Không đọc được dữ liệu')
        ? technicalMessage
        : 'Chưa thể tổng hợp dữ liệu kiểm tra nhân viên.'
    return NextResponse.json({
      ok: false,
      error: error instanceof ApiError ? error.message : publicMessage,
    }, { status })
  }
}
