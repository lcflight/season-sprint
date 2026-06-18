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

describe('ModeSwitcher admin link visibility', () => {
  const { flags, isAdmin } = useFlags()

  beforeEach(() => {
    // Reset the shared singleton between cases.
    for (const k of Object.keys(flags)) delete flags[k]
    isAdmin.value = false
  })

  it('hides the Admin link when the user is not an admin', async () => {
    isAdmin.value = false
    const html = await render()
    expect(html).not.toContain('/admin')
    expect(html).not.toContain('Admin')
    // World Tour is always present.
    expect(html).toContain('/world-tour')
  })

  it('shows the Admin link when the user is an admin', async () => {
    isAdmin.value = true
    const html = await render()
    expect(html).toContain('/admin')
    expect(html).toContain('Admin')
  })

  it('hides the Ranked link until the ranked flag is on', async () => {
    flags.ranked = false
    expect(await render()).not.toContain('/ranked')
    flags.ranked = true
    expect(await render()).toContain('/ranked')
  })
})
