import { ActivityDate } from "@/components/activity-date"

const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

function normalizeTimestamp(value: string) {
  const match = TIMESTAMP_PATTERN.exec(value)
  if (!match) return null

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, offset] = match
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (year < 1 || !daysInMonth || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null
  if (!offset) return { asRecorded: true as const, value }

  let normalizedOffset = offset
  if (offset !== "Z") {
    const offsetDigits = offset.slice(1).replace(":", "")
    const offsetHour = offsetDigits.slice(0, 2)
    const offsetMinute = offsetDigits.slice(2) || "00"
    if (Number(offsetHour) > 23 || Number(offsetMinute) > 59) return null
    normalizedOffset = `${offset[0]}${offsetHour}:${offsetMinute}`
  }

  // JavaScript dates use milliseconds; the source value remains unchanged in the API.
  const milliseconds = fraction ? `.${fraction.slice(0, 3).padEnd(3, "0")}` : ""
  const normalized = `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}${milliseconds}${normalizedOffset}`
  if (Number.isNaN(new Date(normalized).getTime())) return null
  return { asRecorded: false as const, value: normalized }
}

export function DeliveryDate({ value }: { value: string | null }) {
  const timestamp = value ? normalizeTimestamp(value) : null
  if (!timestamp) return <span className="text-muted-foreground">Unavailable</span>
  if (!timestamp.asRecorded) return <ActivityDate value={timestamp.value} />
  return (
    <span className="block [overflow-wrap:anywhere]">
      <span className="block">{timestamp.value}</span>
      <span className="mt-1 block text-xs text-muted-foreground">As recorded · no timezone</span>
    </span>
  )
}
