import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock window.location for BASE URL resolution
vi.stubGlobal('window', { location: { hostname: 'localhost' } })

// Mock clerk service
vi.mock('@/services/clerk.js', () => ({
  getAuthToken: vi.fn().mockResolvedValue(null),
}))

// Mock process.env
process.env.VUE_APP_API_BASE_URL = ''
process.env.VUE_APP_DEV_AUTH_TOKEN = 'test-dev-token'

// Import after mocks are set up
const {
  getRecords,
  upsertRecord,
  deleteRecord,
  deleteAllRecords,
  bulkUpsertRecords,
  getAuthorizationHeader,
} = await import('@/services/api')

describe('api service', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('getRecords', () => {
    it('calls GET /me/records with auth header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: '1', date: '2026-03-01', winPoints: 100 }]),
      })

      const result = await getRecords('Bearer token123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/me/records',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
        })
      )
      expect(result).toEqual([{ id: '1', date: '2026-03-01', winPoints: 100 }])
    })

    it('throws without auth header', async () => {
      await expect(getRecords(null)).rejects.toThrow('Missing authorization header')
    })
  })

  describe('upsertRecord', () => {
    it('calls POST /me/records with date and winPoints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ record: { id: '1' } }),
      })

      await upsertRecord('2026-03-01', 100, 'Bearer token123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/me/records',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ date: '2026-03-01', winPoints: 100 }),
        })
      )
    })
  })

  describe('deleteRecord', () => {
    it('calls DELETE /me/records/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      })

      await deleteRecord('record-123', 'Bearer token123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/me/records/record-123',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
        })
      )
    })

    it('throws without auth header', async () => {
      await expect(deleteRecord('id', null)).rejects.toThrow('Missing authorization header')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteRecord('id', 'Bearer t')).rejects.toThrow('404')
    })
  })

  describe('deleteAllRecords', () => {
    it('calls DELETE /me/records', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: 3 }),
      })

      const result = await deleteAllRecords('Bearer token123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/me/records',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
        })
      )
      expect(result).toEqual({ deleted: 3 })
    })

    it('throws without auth header', async () => {
      await expect(deleteAllRecords(null)).rejects.toThrow('Missing authorization header')
    })
  })

  describe('bulkUpsertRecords', () => {
    it('calls POST /me/records/bulk with records array', async () => {
      const input = [
        { date: '2026-03-01', winPoints: 100 },
        { date: '2026-03-02', winPoints: 200 },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ records: input }),
      })

      const result = await bulkUpsertRecords(input, 'Bearer token123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/me/records/bulk',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ records: input }),
        })
      )
      expect(result).toEqual({ records: input })
    })

    it('throws without auth header', async () => {
      await expect(bulkUpsertRecords([], null)).rejects.toThrow('Missing authorization header')
    })
  })

  describe('getAuthorizationHeader', () => {
    it('returns dev token on localhost when no clerk token available', async () => {
      // getAuthToken will fail/return null since Clerk isn't loaded
      const header = await getAuthorizationHeader()
      expect(header).toBe('test-dev-token')
    })
  })
})
