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

export type ServerAddress = string

export type Snapshot = {
  ts: number
  state: ServerState
  online: number | null
}

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
const POLL_INTERVAL_MS = 10 * 60 * 1000

const defaultSettings: AlertSettings = {
  whitelistMode: true,
  whitelist: [],
  blacklist: [],
  countAlertEnabled: false,
  countAlertMode: 'any_increase',
  countThreshold: 5,
  chartHours: 12,
  soundEnabled: true,
  systemNotifyEnabled: true,
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase()
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
  let pollTimer: ReturnType<typeof setInterval> | null = null

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
        const parsed = JSON.parse(rawSettings) as Partial<AlertSettings>
        settings.value = {
          whitelistMode:
            typeof parsed.whitelistMode === 'boolean'
              ? parsed.whitelistMode
              : defaultSettings.whitelistMode,
          whitelist: sanitizeRules(parsed.whitelist),
          blacklist: sanitizeRules(parsed.blacklist),
          countAlertEnabled:
            typeof parsed.countAlertEnabled === 'boolean'
              ? parsed.countAlertEnabled
              : defaultSettings.countAlertEnabled,
          countAlertMode:
            parsed.countAlertMode === 'threshold' ? 'threshold' : defaultSettings.countAlertMode,
          countThreshold:
            typeof parsed.countThreshold === 'number'
              ? Math.max(1, Math.floor(parsed.countThreshold))
              : defaultSettings.countThreshold,
          chartHours:
            typeof parsed.chartHours === 'number'
              ? Math.min(168, Math.max(1, Math.floor(parsed.chartHours)))
              : defaultSettings.chartHours,
          soundEnabled:
            typeof parsed.soundEnabled === 'boolean'
              ? parsed.soundEnabled
              : defaultSettings.soundEnabled,
          systemNotifyEnabled:
            typeof parsed.systemNotifyEnabled === 'boolean'
              ? parsed.systemNotifyEnabled
              : defaultSettings.systemNotifyEnabled,
        }
      }
    } catch {
      settings.value = { ...defaultSettings }
    }

    for (const address of servers.value) {
      runtimes[address] = ensureRuntime(address)
      serverInitialized[address] = false
      lastSeenPlayersByServer[address] = []
      lastOnlineCountByServer[address] = null
    }
  }

  function persistServers() {
    localStorage.setItem(STORAGE_SERVERS, JSON.stringify(servers.value))
  }

  function persistSettings() {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings.value))
  }

  function trimHistory(history: Snapshot[]) {
    const minTs = Date.now() - settings.value.chartHours * 60 * 60 * 1000
    return history.filter((entry) => entry.ts >= minTs)
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
    return true
  }

  function removeServer(address: string) {
    servers.value = servers.value.filter((it) => it !== address)
    delete runtimes[address]
    delete serverInitialized[address]
    delete lastSeenPlayersByServer[address]
    delete lastOnlineCountByServer[address]
  }

  async function refreshServer(address: string, canAlert: boolean) {
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
    runtime.history = trimHistory(
      runtime.history.concat({
        ts: now,
        state: result.state,
        online: result.online,
      }),
    )
    runtimes[address] = runtime

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

  async function refreshAll() {
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
        const result = await refreshServer(address, canAlert)

        for (const player of result.playerJoinEvents) {
          if (!playerAlertMap.has(player)) {
            playerAlertMap.set(player, new Set())
          }
          playerAlertMap.get(player)?.add(address)
        }

        if (canAlert && result.countIncreased && result.previousOnline !== null && result.currentOnline !== null) {
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
      lastRefreshAt.value = Date.now()
    } finally {
      isRefreshing.value = false
    }
  }

  function startPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
    }
    void refreshAll()
    pollTimer = setInterval(() => {
      void refreshAll()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (!pollTimer) {
      return
    }
    clearInterval(pollTimer)
    pollTimer = null
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

  hydrate()

  return {
    servers,
    settings,
    runtimes,
    serverRows,
    isRefreshing,
    lastRefreshAt,
    initializedGlobal,
    addServer,
    removeServer,
    refreshAll,
    startPolling,
    stopPolling,
  }
})
