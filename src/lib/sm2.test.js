import { describe, it, expect } from 'vitest'
import { sm2, DEFAULT_PROGRESS } from './sm2'

describe('sm2', () => {
  it('schedules a new card answered "good" for 1 day out, repetitions 1', () => {
    const result = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    expect(result.intervalDays).toBe(1)
    expect(result.repetitions).toBe(1)
    expect(result.easeFactor).toBe(2.5)
    expect(result.dueDate).toBe('2026-01-02')
  })

  it('schedules the second consecutive "good" review 6 days out', () => {
    const first = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    const second = sm2(first, 'good', new Date('2026-01-02T00:00:00.000Z'))
    expect(second.intervalDays).toBe(6)
    expect(second.repetitions).toBe(2)
  })

  it('schedules the third consecutive "good" review using interval * ease factor', () => {
    const first = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    const second = sm2(first, 'good', new Date('2026-01-02T00:00:00.000Z'))
    const third = sm2(second, 'good', new Date('2026-01-08T00:00:00.000Z'))
    expect(third.intervalDays).toBe(15)
    expect(third.repetitions).toBe(3)
  })

  it('resets repetitions and interval to 1 day on "again"', () => {
    const first = sm2(DEFAULT_PROGRESS, 'good', new Date('2026-01-01T00:00:00.000Z'))
    const second = sm2(first, 'good', new Date('2026-01-02T00:00:00.000Z'))
    const failed = sm2(second, 'again', new Date('2026-01-08T00:00:00.000Z'))
    expect(failed.repetitions).toBe(0)
    expect(failed.intervalDays).toBe(1)
  })

  it('never lets ease factor drop below 1.3', () => {
    let state = DEFAULT_PROGRESS
    for (let i = 0; i < 10; i++) {
      state = sm2(state, 'again', new Date('2026-01-01T00:00:00.000Z'))
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('throws on an unknown grade', () => {
    expect(() => sm2(DEFAULT_PROGRESS, 'terrible')).toThrow('Unknown grade')
  })
})
