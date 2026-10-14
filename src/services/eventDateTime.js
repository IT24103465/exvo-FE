export const localDate = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export const minimumEventTime = (date, now = new Date()) => {
  if (date !== localDate(now)) return undefined
  const nextMinute = new Date(Math.ceil(now.getTime() / 60000) * 60000)
  return localDate(nextMinute) === date
    ? `${String(nextMinute.getHours()).padStart(2, '0')}:${String(nextMinute.getMinutes()).padStart(2, '0')}`
    : '23:59'
}

export const validateEventSchedule = (date, time, now = new Date()) => {
  const selected = new Date(`${date}T${time}:00`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    Number.isNaN(selected.getTime()) ||
    localDate(selected) !== date ||
    selected.getHours() !== Number(time.slice(0, 2)) ||
    selected.getMinutes() !== Number(time.slice(3))
  ) {
    return 'Please enter a valid event date and time.'
  }
  return selected < now ? 'Event date and time must be in the future (your local time).' : ''
}

export const eventStartTimestamp = (event) => {
  if (event?.startsAtUtc) return Date.parse(event.startsAtUtc)
  const date = event?.eventDate || event?.date
  if (!date) return NaN
  if (/Z$|[+-]\d{2}:\d{2}$/.test(date)) return Date.parse(date)
  const wallTime = date.includes('T') ? date : `${date}T${event.time || event.eventTime || '00:00'}:00`
  // Legacy events use Sri Lanka time, independent of the viewer's browser timezone.
  return Date.parse(`${wallTime}Z`) - (event.utcOffsetMinutes ?? 330) * 60000
}

export const isEventExpired = (event, now = Date.now()) => eventStartTimestamp(event) < now
