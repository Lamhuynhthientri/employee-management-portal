import { ApiError, type RequestActor } from '@/lib/server/api-auth'
import { employeeFactoryId, isFactoryId, type FactoryId } from '@/lib/models/factory'

/** Resolve the active branch without allowing a non-Host to widen access. */
export function resolveFactoryScope(actor: RequestActor, requested: string | null | undefined): FactoryId {
  if (actor.role !== 'director') return employeeFactoryId(actor)
  if (requested && !isFactoryId(requested)) throw new ApiError(400, 'Xưởng không hợp lệ.')
  return isFactoryId(requested) ? requested : 'factory-1'
}
