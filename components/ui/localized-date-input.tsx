'use client'

import type { ChangeEvent } from 'react'

export function formatVietnameseDateInputValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return ''

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return ''

  return date.toLocaleDateString('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function LocalizedDateInput({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  className = '',
  ariaLabel = 'Chọn ngày',
}: {
  value: string
  onChange: (value: string, event: ChangeEvent<HTMLInputElement>) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const displayValue = formatVietnameseDateInputValue(value)

  return (
    <div
      className={`mobile-field relative flex items-center focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
    >
      <span aria-hidden className={displayValue ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
        {displayValue || 'Chọn ngày'}
      </span>
      <input
        type="date"
        lang="vi-VN"
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value, event)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  )
}
