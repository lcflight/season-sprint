import { describe, it, expect } from 'vitest'
import { parseCSVText, buildCSV } from '@/utils/csv'

describe('csv utils', () => {
  it('parses simple comma CSV', () => {
    const text = 'date,y\n2025-01-01,1\n2025-01-02,2\n'
    const rows = parseCSVText(text)
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual({ date: '2025-01-01', y: 1 })
  })
  it('detects colon delimiter and normalizes numbers', () => {
    const text = '2025-01-01:1,234\n2025-01-02: 3 210\n'
    const rows = parseCSVText(text)
    expect(rows[0].y).toBe(1234)
    expect(rows[1].y).toBe(3210)
  })
  it('builds CSV string', () => {
    const csv = buildCSV([{ date: '2025-01-01', y: 7 }])
    expect(csv).toContain('date,y')
    expect(csv).toContain('2025-01-01,7')
  })
})

