// Local storage persistence utilities (pure facade around localStorage)

const STORAGE_KEY = 'season-sprint:line-graph:v1'

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    // ignore
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

// Per-key helpers for multiple independent graphs
export function saveStateWithKey(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch (e) {
    // ignore
  }
}

export function loadStateWithKey(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}
