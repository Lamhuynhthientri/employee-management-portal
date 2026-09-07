'use client'

import { FACTORY_IDS, FACTORY_LABELS, type FactoryId } from '@/lib/models/factory'

export function FactorySwitcher({ factoryId, onChange, canSelect = true }: { factoryId: FactoryId; onChange: (factoryId: FactoryId) => void; canSelect?: boolean }) {
  if (!canSelect) return null
  return (
    <div className="mb-4 flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" aria-label="Chọn xưởng">
      {FACTORY_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`min-h-10 flex-1 rounded-xl px-3 text-sm font-black transition ${factoryId === id ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}
        >
          {FACTORY_LABELS[id]}
        </button>
      ))}
    </div>
  )
}
