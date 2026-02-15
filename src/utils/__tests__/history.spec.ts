import { describe, expect, it } from 'vitest'
import { getVisibleHistory, type Snapshot, upsertHistorySnapshot } from '@/utils/history'

const basePoint: Snapshot = {
  ts: 1000,
  slotTs: 0,
  state: 'online',
  online: 5,
  source: 'auto',
  isDraft: false,
}

describe('history utils', () => {
  it('keeps only one manual draft and updates it', () => {
    const first = upsertHistorySnapshot([], { ...basePoint, source: 'manual', isDraft: true }, 'manual', 1000)
    const second = upsertHistorySnapshot(
      first,
      { ...basePoint, ts: 2000, slotTs: 600000, online: 8, source: 'manual', isDraft: true },
      'manual',
      1000,
    )
    expect(second.length).toBe(1)
    expect(second[0]?.isDraft).toBe(true)
    expect(second[0]?.online).toBe(8)
  })

  it('replaces manual draft with auto point', () => {
    const withDraft = upsertHistorySnapshot(
      [],
      { ...basePoint, ts: 2000, slotTs: 600000, source: 'manual', isDraft: true },
      'manual',
      1000,
    )
    const withAuto = upsertHistorySnapshot(
      withDraft,
      { ...basePoint, ts: 3000, slotTs: 600000, source: 'auto', isDraft: false, online: 9 },
      'auto',
      1000,
    )
    expect(withAuto.length).toBe(1)
    expect(withAuto[0]?.isDraft).toBe(false)
    expect(withAuto[0]?.source).toBe('auto')
    expect(withAuto[0]?.online).toBe(9)
  })

  it('caps visible history to 35 segments', () => {
    const history: Snapshot[] = Array.from({ length: 50 }, (_, idx) => ({
      ...basePoint,
      ts: idx,
      slotTs: idx,
      online: idx,
    }))
    const visible = getVisibleHistory(history, 35)
    expect(visible.length).toBe(35)
    expect(visible[0]?.slotTs).toBe(15)
    expect(visible[34]?.slotTs).toBe(49)
  })
})
