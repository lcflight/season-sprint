import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import LineGraph from '@/components/LineGraph.vue'
import { useFlags } from '@/composables/useFlags'

// Keep the render offline: no auth header, so nothing is fetched.
vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getAuthorizationHeader: async () => null }
})

const MESSAGE = 'SeasonSprint is under maintenance'

async function render() {
  return renderToString(createSSRApp(LineGraph, { mode: 'world-tour' }))
}

// The "maintenance" feature flag (Admin page: global or per-user) swaps the
// chart for a stand-by notice.
describe('LineGraph — maintenance flag', () => {
  const { flags } = useFlags()

  beforeEach(() => {
    for (const k of Object.keys(flags)) delete flags[k]
  })

  it('shows the maintenance notice instead of the chart when the flag is on', async () => {
    flags.maintenance = true
    const html = await render()
    expect(html).toContain(MESSAGE)
    expect(html).toContain('awaiting-season')
    expect(html).not.toContain('aria-label="Line chart"')
  })

  it('renders the normal chart when the flag is off', async () => {
    flags.maintenance = false
    const html = await render()
    expect(html).not.toContain(MESSAGE)
    expect(html).toContain('aria-label="Line chart"')
  })
})
