type CronField = Set<number>

const CRON_PARTS = 5
const LIMITS: Array<{ min: number; max: number }> = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 6 }, // day of week
]

export type ParsedCron = {
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
  dayOfMonthAny: boolean
  dayOfWeekAny: boolean
}

export function validateCronExpression(cron: string) {
  try {
    parseCronExpression(cron)
    return { valid: true as const, error: '' }
  } catch (error) {
    return {
      valid: false as const,
      error: error instanceof Error ? error.message : 'Cron expression is invalid.',
    }
  }
}

export function parseCronExpression(cron: string): ParsedCron {
  const trimmed = cron.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length !== CRON_PARTS) {
    throw new Error('Cron 需要 5 段：min hour dom mon dow')
  }

  const minuteField = parseField(parts[0] ?? '', LIMITS[0]!)
  const hourField = parseField(parts[1] ?? '', LIMITS[1]!)
  const dayOfMonthField = parseField(parts[2] ?? '', LIMITS[2]!)
  const monthField = parseField(parts[3] ?? '', LIMITS[3]!)
  const dayOfWeekField = parseField(parts[4] ?? '', LIMITS[4]!)

  return {
    minute: minuteField.values,
    hour: hourField.values,
    dayOfMonth: dayOfMonthField.values,
    month: monthField.values,
    dayOfWeek: dayOfWeekField.values,
    dayOfMonthAny: dayOfMonthField.isAny,
    dayOfWeekAny: dayOfWeekField.isAny,
  }
}

export function getNextCronOccurrence(cron: string, fromDate: Date) {
  const parsed = parseCronExpression(cron)
  const probe = new Date(fromDate.getTime())
  probe.setSeconds(0, 0)
  probe.setMinutes(probe.getMinutes() + 1)

  const maxChecks = 60 * 24 * 366 * 2
  for (let i = 0; i < maxChecks; i += 1) {
    if (matchesCron(parsed, probe)) {
      return probe
    }
    probe.setMinutes(probe.getMinutes() + 1)
  }
  return null
}

function matchesCron(parsed: ParsedCron, date: Date) {
  const minute = date.getMinutes()
  const hour = date.getHours()
  const month = date.getMonth() + 1
  const dayOfMonth = date.getDate()
  const dayOfWeek = date.getDay()

  if (!parsed.minute.has(minute) || !parsed.hour.has(hour) || !parsed.month.has(month)) {
    return false
  }

  const domMatched = parsed.dayOfMonth.has(dayOfMonth)
  const dowMatched = parsed.dayOfWeek.has(dayOfWeek)

  if (parsed.dayOfMonthAny && parsed.dayOfWeekAny) {
    return true
  }
  if (parsed.dayOfMonthAny) {
    return dowMatched
  }
  if (parsed.dayOfWeekAny) {
    return domMatched
  }
  return domMatched || dowMatched
}

function parseField(field: string, limit: { min: number; max: number }) {
  const result = new Set<number>()
  const isAny = field === '*'
  const parts = field.split(',')
  for (const segment of parts) {
    parseSegment(segment.trim(), limit, result)
  }
  if (result.size === 0) {
    throw new Error(`Cron 字段 "${field}" 无有效值`)
  }
  return { values: result, isAny }
}

function parseSegment(segment: string, limit: { min: number; max: number }, out: Set<number>) {
  if (segment === '*') {
    addRange(limit.min, limit.max, 1, out, limit)
    return
  }

  const stepParts = segment.split('/')
  if (stepParts.length > 2) {
    throw new Error(`Cron 字段片段 "${segment}" 无效`)
  }
  const stepText = stepParts[1]
  const step = stepText ? parseIntStrict(stepText, segment) : 1
  if (step <= 0) {
    throw new Error(`Cron 步长必须大于 0: "${segment}"`)
  }

  const base = stepParts[0] ?? ''
  if (base === '*') {
    addRange(limit.min, limit.max, step, out, limit)
    return
  }

  if (base.includes('-')) {
    const [rawStart = '', rawEnd = ''] = base.split('-')
    const start = parseWithDowAlias(rawStart, limit, segment)
    const end = parseWithDowAlias(rawEnd, limit, segment)
    if (start > end) {
      throw new Error(`Cron 范围起点大于终点: "${segment}"`)
    }
    addRange(start, end, step, out, limit)
    return
  }

  const value = parseWithDowAlias(base, limit, segment)
  ensureInRange(value, limit, segment)
  out.add(value)
}

function parseIntStrict(value: string, raw: string) {
  const num = Number(value)
  if (!Number.isInteger(num)) {
    throw new Error(`Cron 数值无效: "${raw}"`)
  }
  return num
}

function parseWithDowAlias(value: string, limit: { min: number; max: number }, raw: string) {
  const parsed = parseIntStrict(value, raw)
  if (limit.min === 0 && limit.max === 6 && parsed === 7) {
    return 0
  }
  return parsed
}

function addRange(
  start: number,
  end: number,
  step: number,
  out: Set<number>,
  limit: { min: number; max: number },
) {
  ensureInRange(start, limit, String(start))
  ensureInRange(end, limit, String(end))
  for (let i = start; i <= end; i += step) {
    out.add(i)
  }
}

function ensureInRange(value: number, limit: { min: number; max: number }, raw: string) {
  if (value < limit.min || value > limit.max) {
    throw new Error(`Cron 数值越界(${limit.min}-${limit.max}): "${raw}"`)
  }
}
