'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  getCachedManagementContact,
  getManagementContact,
  type ManagementContact,
} from '@/lib/services/managementSettingsService'
import { profileImageUrl } from '@/lib/utils/profileImage'

interface ManagementContactValue {
  contact: ManagementContact | null
  ready: boolean
}

const ManagementContactContext = createContext<ManagementContactValue | null>(null)
const previewManagementContact: ManagementContact = {
  uid: 'demo-admin-001',
  fullName: 'Quản lý Minh Sơn',
  photoURL: '',
  facebookUrl: '',
}

export function ManagementContactProvider({ children }: { children: React.ReactNode }) {
  const { authUser, employee, isPreviewMode } = useAuth()
  const [resolved, setResolved] = useState<{ ownerUid: string; value: ManagementContact } | null>(null)
  const [readyUid, setReadyUid] = useState('')
  const needsContact = employee?.role === 'employee'
  const cached = useMemo(
    () => authUser && needsContact && !isPreviewMode ? getCachedManagementContact(authUser.uid) : null,
    [authUser, isPreviewMode, needsContact],
  )
  const contact = isPreviewMode && needsContact
    ? previewManagementContact
    : authUser && resolved?.ownerUid === authUser.uid ? resolved.value : cached

  useEffect(() => {
    if (!authUser || !needsContact) return
    if (isPreviewMode) return

    let active = true
    // The provider survives route changes, so this forced check happens once
    // per app launch—not once per page or notification.
    void getManagementContact({ force: true })
      .then((value) => {
        const url = profileImageUrl(value.photoURL)
        if (url) {
          const image = new Image()
          image.src = url
          void image.decode?.().catch(() => undefined)
        }
        if (active) setResolved({ ownerUid: authUser.uid, value })
      })
      .catch(() => undefined)
      .finally(() => { if (active) setReadyUid(authUser.uid) })
    return () => { active = false }
  }, [authUser, isPreviewMode, needsContact])

  const value = useMemo<ManagementContactValue>(() => ({
    contact,
    ready: Boolean(authUser && (isPreviewMode || contact || readyUid === authUser.uid)),
  }), [authUser, contact, isPreviewMode, readyUid])

  return <ManagementContactContext.Provider value={value}>{children}</ManagementContactContext.Provider>
}

export function useManagementContact(): ManagementContactValue {
  const value = useContext(ManagementContactContext)
  if (!value) throw new Error('useManagementContact must be used inside ManagementContactProvider')
  return value
}
