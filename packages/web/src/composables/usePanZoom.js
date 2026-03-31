import { computed, reactive, ref } from 'vue'
import { clamp } from '@/utils/date'

/**
 * Encapsulates pan/zoom interaction logic for an SVG element.
 *
 * @param {{ width: number, height: number, padding: number }} dimensions - SVG dimensions
 * @param {import('vue').Ref<boolean>} enableNavigation - whether pan/zoom is active
 * @param {import('vue').Ref<number>} navSensitivity - sensitivity multiplier
 */
export function usePanZoom({ width, height, padding }, enableNavigation, navSensitivity) {
  const svgRef = ref(null)
  const zoomScale = ref(1)
  const minScale = 1
  const maxScale = 2
  const translate = reactive({ x: 0, y: 0 })

  const plotTransform = computed(
    () => `translate(${translate.x}, ${translate.y}) scale(${zoomScale.value})`
  )
  const isOutOfDefault = computed(
    () => zoomScale.value !== 1 || translate.x !== 0 || translate.y !== 0
  )

  function resetView() {
    zoomScale.value = 1
    translate.x = 0
    translate.y = 0
  }

  function clampScale(s) {
    return Math.min(maxScale, Math.max(minScale, s))
  }

  function clampTranslate() {
    const s = zoomScale.value
    const maxTx = padding - padding * s
    const minTx = (width - padding) - (width - padding) * s
    const maxTy = padding - padding * s
    const minTy = (height - padding) - (height - padding) * s
    translate.x = clamp(translate.x, minTx, maxTx)
    translate.y = clamp(translate.y, minTy, maxTy)
  }

  function wheelZoom(deltaY, mx, my) {
    const zoomIntensity = 0.0015 * navSensitivity.value
    const scaleFactor = Math.exp(-deltaY * zoomIntensity)
    const oldScale = zoomScale.value
    const newScale = clampScale(oldScale * scaleFactor)
    const k = newScale / oldScale
    translate.x = mx - (mx - translate.x) * k
    translate.y = my - (my - translate.y) * k
    zoomScale.value = newScale
    clampTranslate()
  }

  function svgPointFromEvent(evt) {
    const svg = svgRef.value
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const x = ((evt.clientX - rect.left) / rect.width) * width
    const y = ((evt.clientY - rect.top) / rect.height) * height
    return { x, y }
  }

  function onWheel(evt) {
    if (!enableNavigation.value) return
    evt.preventDefault()
    const { x, y } = svgPointFromEvent(evt)
    const mx = clamp(x, padding, width - padding)
    const my = clamp(y, padding, height - padding)
    wheelZoom(evt.deltaY, mx, my)
  }

  // Pointer interactions (pan + pinch)
  const pointers = reactive(new Map())
  let lastMid = null
  let lastDist = 0
  let isDragging = false
  let lastPos = { x: 0, y: 0 }

  function updatePointer(evt) {
    pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY })
  }

  function removePointer(evt) {
    pointers.delete(evt.pointerId)
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  function distance(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.hypot(dx, dy)
  }

  function onPointerDown(evt) {
    if (!enableNavigation.value) return
    const { x, y } = svgPointFromEvent(evt)
    if (x < padding || x > width - padding || y < padding || y > height - padding)
      return
    evt.currentTarget.setPointerCapture?.(evt.pointerId)
    updatePointer(evt)
    if (pointers.size === 1) {
      isDragging = true
      lastPos = { x: evt.clientX, y: evt.clientY }
    }
  }

  function onPointerMove(evt) {
    if (!enableNavigation.value) return
    if (!pointers.has(evt.pointerId)) return
    updatePointer(evt)
    if (pointers.size === 1 && isDragging) {
      const dx = evt.clientX - lastPos.x
      const dy = evt.clientY - lastPos.y
      translate.x +=
        dx *
        (width / svgRef.value.getBoundingClientRect().width) *
        navSensitivity.value
      translate.y +=
        dy *
        (height / svgRef.value.getBoundingClientRect().height) *
        navSensitivity.value
      clampTranslate()
      lastPos = { x: evt.clientX, y: evt.clientY }
    } else if (pointers.size === 2) {
      const [p1, p2] = Array.from(pointers.values())
      const mid = midpoint(p1, p2)
      const dist = distance(p1, p2)
      if (lastMid && lastDist) {
        const rect = svgRef.value.getBoundingClientRect()
        const mx = ((mid.x - rect.left) / rect.width) * width
        const my = ((mid.y - rect.top) / rect.height) * height
        const scaleChange = dist / lastDist
        const oldScale = zoomScale.value
        const newScale = clampScale(oldScale * scaleChange)
        const k = newScale / oldScale
        translate.x = mx - (mx - translate.x) * k
        translate.y = my - (my - translate.y) * k
        zoomScale.value = newScale
        clampTranslate()
      }
      lastMid = mid
      lastDist = dist
    }
  }

  function onPointerUp(evt) {
    removePointer(evt)
    if (pointers.size < 2) {
      lastMid = null
      lastDist = 0
    }
    if (pointers.size === 0) {
      isDragging = false
    }
  }

  return {
    svgRef,
    zoomScale,
    translate,
    plotTransform,
    isOutOfDefault,
    resetView,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
