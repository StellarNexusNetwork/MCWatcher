import type { ServerState } from '@/services/mcApi'

export type SnapshotSource = 'auto' | 'manual'

export type Snapshot = {
  ts: number
  slotTs: number
  state: ServerState
  online: number | null
  source: SnapshotSource
  isDraft: boolean
}

export function getSlotTs(timestampMs: number, segmentMinutes: number) {
  const slotMs = Math.max(1, segmentMinutes) * 60 * 1000
  return Math.floor(timestampMs / slotMs) * slotMs
}

export function upsertHistorySnapshot(
  history: Snapshot[],
  snapshot: Snapshot,
  source: SnapshotSource,
  storageLimit: number,
) {
  const maxLimit = Math.max(1, storageLimit)
  let next = [...history]

  if (source === 'manual') {
    const draftIndex = findLatestDraftIndex(next)
    if (draftIndex >= 0) {
      next[draftIndex] = { ...snapshot, source: 'manual', isDraft: true }
    } else {
      next.push({ ...snapshot, source: 'manual', isDraft: true })
    }
    return normalizeHistory(next, maxLimit)
  }

  next = next.filter((point) => !point.isDraft)
  const existingIndex = next.findIndex((point) => point.slotTs === snapshot.slotTs)
  if (existingIndex >= 0) {
    next[existingIndex] = { ...snapshot, source: 'auto', isDraft: false }
  } else {
    next.push({ ...snapshot, source: 'auto', isDraft: false })
  }
  return normalizeHistory(next, maxLimit)
}

export function normalizeHistory(history: Snapshot[], storageLimit: number) {
  const bySlot = new Map<number, Snapshot>()
  for (const point of history) {
    const existing = bySlot.get(point.slotTs)
    if (!existing || existing.ts <= point.ts) {
      bySlot.set(point.slotTs, point)
    }
  }
  const sorted = Array.from(bySlot.values()).sort((a, b) => a.slotTs - b.slotTs)
  const maxLimit = Math.max(1, storageLimit)
  if (sorted.length <= maxLimit) {
    return sorted
  }
  return sorted.slice(sorted.length - maxLimit)
}

export function getVisibleHistory(history: Snapshot[], visibleSegments: number) {
  const maxVisible = Math.max(1, Math.min(35, visibleSegments))
  const sorted = [...history].sort((a, b) => a.slotTs - b.slotTs)
  if (sorted.length <= maxVisible) {
    return sorted
  }
  return sorted.slice(sorted.length - maxVisible)
}

function findLatestDraftIndex(history: Snapshot[]) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.isDraft) {
      return i
    }
  }
  return -1
}
