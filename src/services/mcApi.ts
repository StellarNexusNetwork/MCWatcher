export type ServerState = 'online' | 'offline' | 'api_error'

export type ServerStatusResult = {
  state: ServerState
  online: number | null
  max: number | null
  motdHtml: string
  motdClean: string
  playersDataValid: boolean
  players: string[]
}

type StatusApiResponse = {
  online?: boolean
  players?: {
    online?: number
    max?: number
    sample?: Array<{ name?: string }>
  }
  motd?: {
    clean?: string
    html?: string
  }
}

function encodeAddress(address: string) {
  return encodeURIComponent(address.trim())
}

export function getFaviconUrl(address: string) {
  return `https://api.snnetwork.top/api/mc/server/favicon/java/${encodeAddress(address)}`
}

export function getAvatarUrl(name: string) {
  return `https://api.snnetwork.top/api/mc/user/profile/${encodeURIComponent(name)}`
}

export async function fetchServerStatus(address: string): Promise<ServerStatusResult> {
  try {
    const response = await fetch(`https://api.snnetwork.top/api/mc/server/status/java/${encodeAddress(address)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = (await response.json()) as StatusApiResponse

    const motdHtml = typeof data?.motd?.html === 'string' ? data.motd.html : ''
    const motdClean = typeof data?.motd?.clean === 'string' ? data.motd.clean : ''
    const online = typeof data?.players?.online === 'number' ? data.players.online : null
    const max = typeof data?.players?.max === 'number' ? data.players.max : null
    const sample = data?.players?.sample
    const playersDataValid =
      Array.isArray(sample) && sample.every((item) => item && typeof item.name === 'string')
    const players = playersDataValid ? sample.map((item) => item.name as string) : []

    let state: ServerState = 'offline'
    if (data?.online === false) {
      state = 'offline'
    } else if (online !== null) {
      state = 'online'
    }

    return {
      state,
      online,
      max,
      motdHtml,
      motdClean,
      playersDataValid,
      players,
    }
  } catch {
    return {
      state: 'api_error',
      online: null,
      max: null,
      motdHtml: '',
      motdClean: '',
      playersDataValid: false,
      players: [],
    }
  }
}
