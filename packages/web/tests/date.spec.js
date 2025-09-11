import { describe, it, expect } from 'vitest'
import { parseFlexibleDate, dateToMs, formatDate, msToDateInput, addDays, clamp } from '@/utils/date'

describe('date utils', () => {
  it('parses yyyy-mm-dd', () => {
    const d = parseFlexibleDate('2025-01-05')
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(5)
  })
  it('parses mm/dd/yyyy and dd/mm/yyyy', () => {
    expect(parseFlexibleDate('01/05/2025').getMonth()).toBe(0)
    expect(parseFlexibleDate('31/01/2025').getDate()).toBe(31)
  })
  it('parses month names', () => {
    const d1 = parseFlexibleDate('5 Jan 2025')
    const d2 = parseFlexibleDate('Jan 5 2025')
    expect(d1.getMonth()).toBe(0)
    expect(d2.getMonth()).toBe(0)
  })
  it('format and ms conversions are stable', () => {
    const d = new Date(2025, 0, 5)
    const s = formatDate(d)
    const ms = dateToMs(s)
    expect(msToDateInput(ms)).toBe('2025-01-05')
  })
  it('addDays clamps time to local midnight', () => {
    const d = addDays('2025-01-05', 1)
    expect(formatDate(d)).toBe('2025-01-06')
  })
  it('clamp works', () => {
    expect(clamp(5, 0, 3)).toBe(3)
  })
})

