import { describe, expect, it } from 'vitest'
import { getNextCronOccurrence, validateCronExpression } from '@/utils/cron'

describe('cron utils', () => {
  it('validates cron string', () => {
    expect(validateCronExpression('*/10 * * * *').valid).toBe(true)
    expect(validateCronExpression('* * * *').valid).toBe(false)
  })

  it('computes next occurrence for every 10 minutes', () => {
    const from = new Date('2026-02-15T12:03:10')
    const next = getNextCronOccurrence('*/10 * * * *', from)
    expect(next).not.toBeNull()
    expect(next?.getMinutes()).toBe(10)
    expect(next?.getHours()).toBe(12)
  })
})
