/**
 * Timestamp encoding shared by both dialects: 'YYYY-MM-DD HH:MM:SS.mmm' in UTC.
 * MySQL DATETIME(3) accepts it literally; in SQLite it is TEXT that sorts chronologically.
 */
export function toDbTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

export function nowDb(): string {
  return toDbTime(new Date())
}

export function fromDbTime(value: string | Date): Date {
  if (value instanceof Date) return value
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}

export function fromDbTimeOrNull(value: string | Date | null | undefined): Date | null {
  return value === null || value === undefined ? null : fromDbTime(value)
}

export function toDbBool(value: boolean): 0 | 1 {
  return value ? 1 : 0
}

export function fromDbBool(value: number | string | boolean | null | undefined): boolean {
  return value === true || value === 1 || value === '1'
}

/** BIGINT / DECIMAL aggregate -> exact decimal string. */
export function toBigString(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0'
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(Math.trunc(value)).toString() : '0'
  if (typeof value === 'bigint') return value.toString()
  const trimmed = value.includes('.') ? value.slice(0, value.indexOf('.')) : value
  return /^-?\d+$/.test(trimmed) ? BigInt(trimmed).toString() : '0'
}

/** COUNT(*) is BIGINT on MySQL and therefore a string. */
export function toCount(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined) return 0
  return Number(value)
}
