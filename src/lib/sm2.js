const GRADE_QUALITY = { again: 2, hard: 3, good: 4, easy: 5 }
const MIN_EASE_FACTOR = 1.3

export const DEFAULT_PROGRESS = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 }

export function sm2(previous, grade, today = new Date()) {
  const quality = GRADE_QUALITY[grade]
  if (quality === undefined) {
    throw new Error(`Unknown grade: ${grade}`)
  }

  let easeFactor = previous.easeFactor
  let repetitions = previous.repetitions
  let intervalDays

  if (quality < 3) {
    repetitions = 0
    intervalDays = 1
  } else {
    if (repetitions === 0) {
      intervalDays = 1
    } else if (repetitions === 1) {
      intervalDays = 6
    } else {
      intervalDays = Math.round(previous.intervalDays * easeFactor)
    }
    repetitions += 1
  }

  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (easeFactor < MIN_EASE_FACTOR) {
    easeFactor = MIN_EASE_FACTOR
  }

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    repetitions,
    dueDate: addUtcDays(today, intervalDays),
  }
}

// Adds calendar days in UTC, independent of the machine's local timezone,
// so the same (previous, grade, today) always produces the same dueDate.
function addUtcDays(date, days) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const result = new Date(utcMidnight)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
