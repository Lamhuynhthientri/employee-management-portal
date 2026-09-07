'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { employeeFactoryId, isFactoryId, type FactoryId } from '@/lib/models/factory'

export const MANAGEMENT_FACTORY_STORAGE_KEY = 'tricandy:management-factory'

/**
 * The Host can inspect one factory branch at a time. Factory managers are
 * always locked to their own branch, so a client-side URL value can never
 * broaden their read scope.
 */
export function useManagementFactory() {
  const { employee } = useAuth()
  const isHost = employee?.role === 'director'
  const lockedFactory = employee && !isHost ? employeeFactoryId(employee) : null
  const [factoryId, setFactoryIdState] = useState<FactoryId>('factory-1')

  useEffect(() => {
    if (lockedFactory) {
      setFactoryIdState(lockedFactory)
      return
    }
    if (!isHost) return
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('factory')
    const fromStorage = window.localStorage.getItem(MANAGEMENT_FACTORY_STORAGE_KEY)
    setFactoryIdState(isFactoryId(fromUrl) ? fromUrl : isFactoryId(fromStorage) ? fromStorage : 'factory-1')
  }, [isHost, lockedFactory])

  const setFactoryId = useCallback((next: FactoryId) => {
    const safeNext = isHost ? next : (lockedFactory || 'factory-1')
    setFactoryIdState(safeNext)
    if (typeof window === 'undefined') return
    window.localStorage.setItem(MANAGEMENT_FACTORY_STORAGE_KEY, safeNext)
    const url = new URL(window.location.href)
    url.searchParams.set('factory', safeNext)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [isHost, lockedFactory])

  useEffect(() => {
    if (typeof window === 'undefined' || !employee) return
    window.localStorage.setItem(MANAGEMENT_FACTORY_STORAGE_KEY, factoryId)
    const params = new URLSearchParams(window.location.search)
    if (isHost && params.get('factory') !== factoryId) {
      params.set('factory', factoryId)
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`)
    }
  }, [employee, factoryId, isHost])

  return { factoryId, setFactoryId, canSelect: isHost }
}
