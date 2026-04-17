import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Severity, CaseStatus, RunStatus } from '@/types'

// Utility for merging Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format date to readable string
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffDay > 0) return `${diffDay}d ago`
  if (diffHr > 0) return `${diffHr}h ago`
  if (diffMin > 0) return `${diffMin}m ago`
  return 'just now'
}

export function formatDuration(ms?: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

// Generate a TC code like "TC-0042"
export function generateTCCode(count: number): string {
  return `TC-${String(count + 1).padStart(4, '0')}`
}

// Color maps
export const severityConfig: Record<Severity, { label: string; bg: string; text: string; dot: string }> = {
  CRITICAL: { label: 'Critical', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  HIGH:     { label: 'High',     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-500' },
  LOW:      { label: 'Low',      bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
}

export const statusConfig: Record<CaseStatus, { label: string; bg: string; text: string; dot: string; icon: string }> = {
  PASSED:      { label: 'Passed',      bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: 'check_circle' },
  FAILED:      { label: 'Failed',      bg: 'bg-pink-100',    text: 'text-pink-700',    dot: 'bg-pink-500',    icon: 'cancel' },
  UNTESTED:    { label: 'Untested',    bg: 'bg-slate-100',   text: 'text-slate-500',   dot: 'bg-slate-300',   icon: 'radio_button_unchecked' },
  BLOCKED:     { label: 'Blocked',     bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400',   icon: 'block' },
}

export const runStatusConfig: Record<RunStatus, { label: string; bg: string; text: string; icon: string }> = {
  QUEUED:    { label: 'Queued',    bg: 'bg-slate-100',   text: 'text-slate-500',   icon: 'hourglass_empty' },
  RUNNING:   { label: 'Running',   bg: 'bg-amber-100',   text: 'text-amber-700',   icon: 'pending' },
  PASSED:    { label: 'Passed',    bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'check_circle' },
  FAILED:    { label: 'Failed',    bg: 'bg-pink-100',    text: 'text-pink-700',    icon: 'cancel' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-slate-100',   text: 'text-slate-400',   icon: 'block' },
}

// Recursively build a flat list from nested folders
export function flattenFolders(folders: import('@/types').Folder[]): import('@/types').Folder[] {
  const result: import('@/types').Folder[] = []
  function walk(f: import('@/types').Folder) {
    result.push(f)
    if (f.children) f.children.forEach(walk)
  }
  folders.forEach(walk)
  return result
}
