export type ServerAddress = string

export type PlayerAlertScope = { mode: 'global' } | { mode: 'servers'; servers: ServerAddress[] }

export type PlayerRuleItem = {
  playerId: string
  scope: PlayerAlertScope
}

export type CountAlertMode = 'any_increase' | 'threshold'
export type CurveColorMode = 'latest_state' | 'per_segment'

export type AlertSettings = {
  whitelistMode: boolean
  whitelist: PlayerRuleItem[]
  blacklist: PlayerRuleItem[]
  countAlertEnabled: boolean
  countAlertMode: CountAlertMode
  countThreshold: number
  chartSegmentMinutes: number
  chartVisibleSegments: number
  historyStorageLimit: number
  curveColorMode: CurveColorMode
  showStatusTrack: boolean
  refreshCron: string
  soundEnabled: boolean
  systemNotifyEnabled: boolean
}

export function playerInRuleSet(playerId: string, address: ServerAddress, rules: PlayerRuleItem[]) {
  return rules.some((rule) => {
    if (rule.playerId.trim().toLowerCase() !== playerId.trim().toLowerCase()) {
      return false
    }
    if (rule.scope.mode === 'global') {
      return true
    }
    return rule.scope.servers.includes(address)
  })
}

export function shouldAlertPlayer(
  playerId: string,
  address: ServerAddress,
  settings: AlertSettings,
) {
  const inWhitelist = playerInRuleSet(playerId, address, settings.whitelist)
  const inBlacklist = playerInRuleSet(playerId, address, settings.blacklist)

  if (settings.whitelistMode) {
    return inWhitelist
  }
  return !inBlacklist
}

export function shouldAlertCount(
  prevOnline: number | null,
  currentOnline: number | null,
  settings: AlertSettings,
) {
  if (!settings.countAlertEnabled || prevOnline === null || currentOnline === null) {
    return false
  }
  if (settings.countAlertMode === 'any_increase') {
    return currentOnline > prevOnline
  }
  return currentOnline - prevOnline >= Math.max(1, settings.countThreshold)
}
