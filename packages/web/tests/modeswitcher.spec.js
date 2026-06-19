import { describe, it, expect, beforeEach } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ModeSwitcher from '@/components/ModeSwitcher.vue'
import { useFlags } from '@/composables/useFlags'

// router-link is registered globally by the router plugin, which isn't present
// in tests. Stub it with a plain <a> that renders the segment label.
const RouterLinkStub = {
  name: 'RouterLink',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots }) {
    return () => h('a', { href: String(props.to) }, slots.default?.())
  },
}

async function render() {
  const app = createSSRApp(ModeSwitcher)
  app.component('RouterLink', RouterLinkStub)
  return renderToString(app)
}

describe('ModeSwitcher segments', () => {
  const { flags, isAdmin } = useFlags()

  beforeEach(() => {
    // Reset the shared singleton between cases.
    for (const k of Object.keys(flags)) delete flags[k]
    isAdmin.value = false
  })

  it('always shows the World Tour segment', async () => {
    const html = await render()
    expect(html).toContain('/world-tour')
  })

  it('never shows an Admin link (admin lives in the user dropdown)', async () => {
    // Admin moved from the mode switcher into UserMenu, so it must not appear
    // here even for admins.
    isAdmin.value = true
    const html = await render()
    expect(html).not.toContain('/admin')
    expect(html).not.toContain('Admin')
  })

  it('shows Ranked as a disabled "coming soon" segment until the flag is on', async () => {
    // Flag off: Ranked is visible but inert — no link to /ranked, marked
    // disabled with a "Soon" badge.
    flags.ranked = false
    const off = await render()
    expect(off).not.toContain('href="/ranked"')
    expect(off).toContain('Ranked')
    expect(off).toContain('aria-disabled="true"')
    expect(off).toContain('Soon')

    // Flag on: Ranked becomes a real link with no disabled markers.
    flags.ranked = true
    const on = await render()
    expect(on).toContain('href="/ranked"')
    expect(on).not.toContain('aria-disabled="true"')
    expect(on).not.toContain('Soon')
  })
})
