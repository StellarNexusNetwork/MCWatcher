import { describe, expect, it } from 'vitest'
import { shouldAlertCount, shouldAlertPlayer, type AlertSettings } from '@/services/alertEngine'

const baseSettings: AlertSettings = {
  whitelistMode: true,
  whitelist: [],
  blacklist: [],
  countAlertEnabled: false,
  countAlertMode: 'any_increase',
  countThreshold: 3,
  chartHours: 12,
  soundEnabled: true,
  systemNotifyEnabled: true,
}

describe('alertEngine', () => {
  it('matches whitelist in whitelist mode with server scoped rule', () => {
    const settings: AlertSettings = {
      ...baseSettings,
      whitelistMode: true,
      whitelist: [{ playerId: 'Alice', scope: { mode: 'servers', servers: ['a.example.com'] } }],
    }
    expect(shouldAlertPlayer('Alice', 'a.example.com', settings)).toBe(true)
    expect(shouldAlertPlayer('Alice', 'b.example.com', settings)).toBe(false)
  })

  it('blocks blacklist in non-whitelist mode', () => {
    const settings: AlertSettings = {
      ...baseSettings,
      whitelistMode: false,
      blacklist: [{ playerId: 'Bob', scope: { mode: 'global' } }],
    }
    expect(shouldAlertPlayer('Bob', 'a.example.com', settings)).toBe(false)
    expect(shouldAlertPlayer('Charlie', 'a.example.com', settings)).toBe(true)
  })

  it('checks count alert modes', () => {
    expect(shouldAlertCount(10, 11, { ...baseSettings, countAlertEnabled: true, countAlertMode: 'any_increase' })).toBe(true)
    expect(shouldAlertCount(10, 12, { ...baseSettings, countAlertEnabled: true, countAlertMode: 'threshold', countThreshold: 3 })).toBe(false)
    expect(shouldAlertCount(10, 13, { ...baseSettings, countAlertEnabled: true, countAlertMode: 'threshold', countThreshold: 3 })).toBe(true)
  })
})
