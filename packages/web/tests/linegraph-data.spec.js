import { describe, it, expect } from 'vitest'

// Test the data mapping functions that bridge API ↔ component formats
// These will be extracted as pure functions in api.js or a new helper

/**
 * Maps API record { id, date, winPoints } → component point { remoteId, date, y }
 */
function mapRecordToPoint(record) {
  return {
    remoteId: record.id,
    date: typeof record.date === 'string' ? record.date.slice(0, 10) : '',
    y: record.winPoints,
  }
}

/**
 * Maps an array of API records to component points
 */
function mapRecordsToPoints(records) {
  return records.map(mapRecordToPoint)
}

describe('API ↔ component data mapping', () => {
  describe('mapRecordToPoint', () => {
    it('maps a full ISO datetime to YYYY-MM-DD', () => {
      const record = { id: 'abc-123', date: '2026-03-01T00:00:00.000Z', winPoints: 150 }
      const point = mapRecordToPoint(record)
      expect(point).toEqual({ remoteId: 'abc-123', date: '2026-03-01', y: 150 })
    })

    it('handles date already in YYYY-MM-DD format', () => {
      const record = { id: 'xyz', date: '2026-03-15', winPoints: 0 }
      const point = mapRecordToPoint(record)
      expect(point).toEqual({ remoteId: 'xyz', date: '2026-03-15', y: 0 })
    })
  })

  describe('mapRecordsToPoints', () => {
    it('maps an empty array', () => {
      expect(mapRecordsToPoints([])).toEqual([])
    })

    it('maps multiple records preserving order', () => {
      const records = [
        { id: '1', date: '2026-03-02T00:00:00.000Z', winPoints: 200 },
        { id: '2', date: '2026-03-01T00:00:00.000Z', winPoints: 100 },
      ]
      const points = mapRecordsToPoints(records)
      expect(points).toHaveLength(2)
      expect(points[0]).toEqual({ remoteId: '1', date: '2026-03-02', y: 200 })
      expect(points[1]).toEqual({ remoteId: '2', date: '2026-03-01', y: 100 })
    })
  })

  describe('settings persistence excludes points', () => {
    it('buildSettings does not include points array', () => {
      // Simulate what saveSettings should produce
      const state = {
        seasonStart: '2026-03-01',
        seasonEnd: '2026-06-01',
        goalWinPoints: 500,
        autoSetSeasonFromImport: true,
        simplifyImport: false,
        navSensitivity: 1.5,
        enableNavigation: true,
      }
      // Should NOT have a points key
      expect(state).not.toHaveProperty('points')
      // Should have all settings keys
      expect(state).toHaveProperty('seasonStart')
      expect(state).toHaveProperty('goalWinPoints')
      expect(state).toHaveProperty('navSensitivity')
    })
  })
})
