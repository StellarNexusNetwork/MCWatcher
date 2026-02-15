import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { fetchServerStatus, getFaviconUrl, type ServerState } from '@/services/mcApi'
import {
  shouldAlertCount,
  shouldAlertPlayer,
  type AlertSettings,
  type PlayerRuleItem,
} from '@/services/alertEngine'
import { notifySystem, playAlertTone } from '@/composables/useNotifications'
import { sanitizeMotdHtml } from '@/utils/sanitizeMotd'
import { getNextCronOccurrence } from '@/utils/cron'
import {
  getSlotTs,
  normalizeHistory,
  type Snapshot,
  type SnapshotSource,
  upsertHistorySnapshot,
} from '@/utils/history'

export type ServerAddress = string

export type ServerRuntime = {
  address: ServerAddress
  faviconUrl: string
  motdHtmlSafe: string
  motdText: string
  state: ServerState
  online: number | null
  max: number | null
  playersDataValid: boolean
  players: string[]
  history: Snapshot[]
}

const STORAGE_SERVERS = 'mcwatcher.servers'
const STORAGE_SETTINGS = 'mcwatcher.settings'
const STORAGE_HISTORY = 'mcwatcher.history'

const defaultSettings: AlertSettings = {
  whitelistMode: true,
  whitelist: [],
  blacklist: [],
  countAlertEnabled: false,
  countAlertMode: 'any_increase',
  countThreshold: 5,
  chartSegmentMinutes: 10,
  chartVisibleSegments: 35,
  historyStorageLimit: 1000,
  curveColorMode: 'latest_state',
  showStatusTrack: true,
  refreshCron: '*/10 * * * *',
  soundEnabled: true,
  systemNotifyEnabled: true,
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase()
}

function ensureRuntime(address: string): ServerRuntime {
  return {
    address,
    faviconUrl: getFaviconUrl(address),
    motdHtmlSafe: '',
    motdText: '',
    state: 'offline',
    online: null,
    max: null,
    playersDataValid: false,
    players: [],
    history: [],
  }
}

function sanitizeRules(input: unknown): PlayerRuleItem[] {
  if (!Array.isArray(input)) {
    return []
  }
  const rules: PlayerRuleItem[] = []
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const item = entry as Partial<PlayerRuleItem>
    const playerId = typeof item.playerId === 'string' ? item.playerId.trim() : ''
    if (!playerId) {
      continue
    }
    if (item.scope?.mode === 'servers' && Array.isArray(item.scope.servers)) {
      rules.push({
        playerId,
        scope: {
          mode: 'servers',
          servers: item.scope.servers.map((it) => normalizeAddress(String(it))).filter(Boolean),
        },
      })
    } else {
      rules.push({ playerId, scope: { mode: 'global' } })
    }
  }
  return rules
}

function normalizeSettings(raw: Partial<AlertSettings> & { chartHours?: number }): AlertSettings {
  const segmentMinutes =
    typeof raw.chartSegmentMinutes === 'number'
      ? Math.max(1, Math.floor(raw.chartSegmentMinutes))
      : 10

  const migratedVisibleSegments =
    typeof raw.chartVisibleSegments === 'number'
      ? Math.floor(raw.chartVisibleSegments)
      : typeof raw.chartHours === 'number'
        ? Math.floor((raw.chartHours * 60) / segmentMinutes)
        : 35

  return {
    whitelistMode:
      typeof raw.whitelistMode === 'boolean' ? raw.whitelistMode : defaultSettings.whitelistMode,
    whitelist: sanitizeRules(raw.whitelist),
    blacklist: sanitizeRules(raw.blacklist),
    countAlertEnabled:
      typeof raw.countAlertEnabled === 'boolean'
        ? raw.countAlertEnabled
        : defaultSettings.countAlertEnabled,
    countAlertMode: raw.countAlertMode === 'threshold' ? 'threshold' : 'any_increase',
    countThreshold:
      typeof raw.countThreshold === 'number'
        ? Math.max(1, Math.floor(raw.countThreshold))
        : defaultSettings.countThreshold,
    chartSegmentMinutes: segmentMinutes,
    chartVisibleSegments: Math.max(1, Math.min(35, migratedVisibleSegments)),
    historyStorageLimit:
      typeof raw.historyStorageLimit === 'number'
        ? Math.max(50, Math.floor(raw.historyStorageLimit))
        : defaultSettings.historyStorageLimit,
    curveColorMode: raw.curveColorMode === 'per_segment' ? 'per_segment' : 'latest_state',
    showStatusTrack:
      typeof raw.showStatusTrack === 'boolean' ? raw.showStatusTrack : defaultSettings.showStatusTrack,
    refreshCron:
      typeof raw.refreshCron === 'string' && raw.refreshCron.trim()
        ? raw.refreshCron.trim()
        : defaultSettings.refreshCron,
    soundEnabled:
      typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : defaultSettings.soundEnabled,
    systemNotifyEnabled:
      typeof raw.systemNotifyEnabled === 'boolean'
        ? raw.systemNotifyEnabled
        : defaultSettings.systemNotifyEnabled,
  }
}

export const useWatcherStore = defineStore('watcher', () => {
  const servers = ref<ServerAddress[]>([])
  const settings = ref<AlertSettings>({ ...defaultSettings })
  const runtimes = reactive<Record<ServerAddress, ServerRuntime>>({})

  const initializedGlobal = ref(false)
  const serverInitialized = reactive<Record<ServerAddress, boolean>>({})
  const lastSeenPlayersByServer = reactive<Record<ServerAddress, string[]>>({})
  const lastOnlineCountByServer = reactive<Record<ServerAddress, number | null>>({})

  const isRefreshing = ref(false)
  const lastRefreshAt = ref<number | null>(null)
  const nextRefreshAt = ref<number | null>(null)
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  const pollingEnabled = ref(false)

  const serverRows = computed(() =>
    servers.value.map((address) => {
      if (!runtimes[address]) {
        runtimes[address] = ensureRuntime(address)
      }
      return runtimes[address]
    }),
  )

  function hydrate() {
    try {
      const rawServers = localStorage.getItem(STORAGE_SERVERS)
      if (rawServers) {
        const parsed = JSON.parse(rawServers) as unknown
        if (Array.isArray(parsed)) {
          servers.value = parsed.map((it) => normalizeAddress(String(it))).filter(Boolean)
        }
      }
    } catch {
      servers.value = []
    }

    try {
      const rawSettings = localStorage.getItem(STORAGE_SETTINGS)
      if (rawSettings) {
        settings.value = normalizeSettings(JSON.parse(rawSettings) as Partial<AlertSettings> & { chartHours?: number })
      }
    } catch {
      settings.value = { ...defaultSettings }
    }

    const historyMap = loadHistoryMap()
    for (const address of servers.value) {
      const runtime = ensureRuntime(address)
      runtime.history = normalizeHistory(historyMap[address] ?? [], settings.value.historyStorageLimit)
      runtimes[address] = runtime
      serverInitialized[address] = false
      lastSeenPlayersByServer[address] = []
      lastOnlineCountByServer[address] = null
    }
  }

  function loadHistoryMap() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY)
      if (!raw) {
        return {} as Record<ServerAddress, Snapshot[]>
      }
      const parsed = JSON.parse(raw) as Record<ServerAddress, unknown>
      const result: Record<ServerAddress, Snapshot[]> = {}
      for (const [address, value] of Object.entries(parsed)) {
        if (!Array.isArray(value)) {
          continue
        }
        const normalized: Snapshot[] = []
        for (const entry of value) {
          if (!entry || typeof entry !== 'object') {
            continue
          }
          const point = entry as Partial<Snapshot>
          if (typeof point.ts !== 'number' || typeof point.slotTs !== 'number') {
            continue
          }
          normalized.push({
            ts: point.ts,
            slotTs: point.slotTs,
            state:
              point.state === 'online' || point.state === 'offline' || point.state === 'api_error'
                ? point.state
                : 'api_error',
            online: typeof point.online === 'number' ? point.online : null,
            source: point.source === 'manual' ? 'manual' : 'auto',
            isDraft: Boolean(point.isDraft),
          })
        }
        result[address] = normalized
      }
      return result
    } catch {
      return {} as Record<ServerAddress, Snapshot[]>
    }
  }

  function persistServers() {
    localStorage.setItem(STORAGE_SERVERS, JSON.stringify(servers.value))
  }

  function persistSettings() {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings.value))
  }

  function persistHistory() {
    const historyMap: Record<ServerAddress, Snapshot[]> = {}
    for (const address of servers.value) {
      const runtime = runtimes[address]
      if (!runtime) {
        continue
      }
      historyMap[address] = normalizeHistory(runtime.history, settings.value.historyStorageLimit)
    }
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(historyMap))
  }

  function addServer(rawAddress: string) {
    const address = normalizeAddress(rawAddress)
    if (!address || servers.value.includes(address)) {
      return false
    }
    servers.value = [...servers.value, address]
    runtimes[address] = ensureRuntime(address)
    serverInitialized[address] = false
    lastSeenPlayersByServer[address] = []
    lastOnlineCountByServer[address] = null
    persistHistory()
    return true
  }

  function removeServer(address: string) {
    servers.value = servers.value.filter((it) => it !== address)
    delete runtimes[address]
    delete serverInitialized[address]
    delete lastSeenPlayersByServer[address]
    delete lastOnlineCountByServer[address]
    persistHistory()
  }

  function appendSnapshot(
    address: string,
    source: SnapshotSource,
    state: ServerState,
    online: number | null,
    now: number,
  ) {
    const runtime = runtimes[address] ?? ensureRuntime(address)
    const slotTs = getSlotTs(now, settings.value.chartSegmentMinutes)
    const snapshot: Snapshot = {
      ts: now,
      slotTs,
      state,
      online,
      source,
      isDraft: source === 'manual',
    }
    runtime.history = upsertHistorySnapshot(
      runtime.history,
      snapshot,
      source,
      settings.value.historyStorageLimit,
    )
    runtimes[address] = runtime
  }

  function resegmentAllHistories() {
    for (const address of servers.value) {
      const runtime = runtimes[address]
      if (!runtime) {
        continue
      }
      const mapped = runtime.history.map((point) => ({
        ...point,
        slotTs: getSlotTs(point.ts, settings.value.chartSegmentMinutes),
      }))
      runtime.history = normalizeHistory(mapped, settings.value.historyStorageLimit)
    }
    persistHistory()
  }

  async function refreshServer(address: string, canAlert: boolean, source: SnapshotSource) {
    const result = await fetchServerStatus(address)
    const runtime = runtimes[address] ?? ensureRuntime(address)
    const now = Date.now()

    runtime.state = result.state
    runtime.online = result.online
    runtime.max = result.max
    runtime.playersDataValid = result.playersDataValid
    runtime.players = result.players
    runtime.motdText = result.motdClean
    runtime.motdHtmlSafe = sanitizeMotdHtml(result.motdHtml, result.motdClean)
    runtimes[address] = runtime

    appendSnapshot(address, source, result.state, result.online, now)

    const previousPlayers = new Set(lastSeenPlayersByServer[address] ?? [])
    const currentPlayers = new Set(result.playersDataValid ? result.players : [])
    const previousOnline = lastOnlineCountByServer[address] ?? null

    const playerJoinEvents: string[] = []
    const countIncreased = shouldAlertCount(previousOnline, result.online, settings.value)

    if (canAlert && result.playersDataValid) {
      for (const player of currentPlayers) {
        if (!previousPlayers.has(player) && shouldAlertPlayer(player, address, settings.value)) {
          playerJoinEvents.push(player)
        }
      }
    }

    lastSeenPlayersByServer[address] = Array.from(currentPlayers)
    lastOnlineCountByServer[address] = result.online
    serverInitialized[address] = true

    return {
      playerJoinEvents,
      countIncreased,
      previousOnline,
      currentOnline: result.online,
    }
  }

  async function dispatchAlerts(
    playerAlertMap: Map<string, Set<string>>,
    countAlerts: Array<{ address: string; from: number; to: number }>,
  ) {
    if (playerAlertMap.size === 0 && countAlerts.length === 0) {
      return
    }

    playAlertTone(settings.value.soundEnabled)

    for (const [player, addresses] of playerAlertMap.entries()) {
      const addressText = Array.from(addresses).join(', ')
      await notifySystem(
        '玩家上线提醒',
        `${player} 已上线：${addressText}`,
        settings.value.systemNotifyEnabled,
      )
    }

    for (const event of countAlerts) {
      await notifySystem(
        '人数增加提醒',
        `${event.address} 人数增长：${event.from} -> ${event.to}`,
        settings.value.systemNotifyEnabled,
      )
    }
  }

  async function refreshAll(source: SnapshotSource = 'auto') {
    if (isRefreshing.value) {
      return
    }
    isRefreshing.value = true
    const playerAlertMap = new Map<string, Set<string>>()
    const countAlerts: Array<{ address: string; from: number; to: number }> = []
    const globalReady = initializedGlobal.value

    try {
      for (const address of servers.value) {
        const canAlert = globalReady && !!serverInitialized[address]
        const result = await refreshServer(address, canAlert, source)

        for (const player of result.playerJoinEvents) {
          if (!playerAlertMap.has(player)) {
            playerAlertMap.set(player, new Set())
          }
          playerAlertMap.get(player)?.add(address)
        }

        if (
          canAlert &&
          result.countIncreased &&
          result.previousOnline !== null &&
          result.currentOnline !== null
        ) {
          countAlerts.push({
            address,
            from: result.previousOnline,
            to: result.currentOnline,
          })
        }
      }

      if (globalReady) {
        await dispatchAlerts(playerAlertMap, countAlerts)
      } else {
        initializedGlobal.value = true
      }

      persistHistory()
      lastRefreshAt.value = Date.now()
    } finally {
      isRefreshing.value = false
    }
  }

  function clearPollTimer() {
    if (!pollTimer) {
      return
    }
    clearTimeout(pollTimer)
    pollTimer = null
  }

  function scheduleNextAutoRefresh() {
    clearPollTimer()
    if (!pollingEnabled.value) {
      nextRefreshAt.value = null
      return
    }
    const now = new Date()
    let delay = 10 * 60 * 1000
    let targetTs = now.getTime() + delay
    try {
      const next = getNextCronOccurrence(settings.value.refreshCron, now)
      if (next) {
        delay = Math.max(1, next.getTime() - now.getTime())
        targetTs = next.getTime()
      }
    } catch {
      delay = 10 * 60 * 1000
      targetTs = now.getTime() + delay
    }
    nextRefreshAt.value = targetTs

    pollTimer = setTimeout(async () => {
      await refreshAll('auto')
      scheduleNextAutoRefresh()
    }, delay)
  }

  function startPolling() {
    pollingEnabled.value = true
    void refreshAll('auto')
    scheduleNextAutoRefresh()
  }

  function stopPolling() {
    pollingEnabled.value = false
    clearPollTimer()
    nextRefreshAt.value = null
  }

  function updateSettings(next: AlertSettings) {
    settings.value = normalizeSettings(next)
  }

  watch(
    servers,
    () => {
      persistServers()
    },
    { deep: true },
  )

  watch(
    settings,
    () => {
      persistSettings()
    },
    { deep: true },
  )

  watch(
    () => settings.value.refreshCron,
    () => {
      if (pollingEnabled.value) {
        scheduleNextAutoRefresh()
      }
    },
  )

  watch(
    () => settings.value.chartSegmentMinutes,
    () => {
      resegmentAllHistories()
    },
  )

  watch(
    () => settings.value.historyStorageLimit,
    () => {
      for (const address of servers.value) {
        const runtime = runtimes[address]
        if (!runtime) {
          continue
        }
        runtime.history = normalizeHistory(runtime.history, settings.value.historyStorageLimit)
      }
      persistHistory()
    },
  )

  hydrate()

  return {
    servers,
    settings,
    runtimes,
    serverRows,
    isRefreshing,
    lastRefreshAt,
    nextRefreshAt,
    initializedGlobal,
    addServer,
    removeServer,
    refreshAll,
    startPolling,
    stopPolling,
    updateSettings,
  }
})
