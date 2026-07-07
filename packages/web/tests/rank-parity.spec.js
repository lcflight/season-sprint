import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

/**
 * Cross-client parity guard for the World Tour domain data.
 *
 * The rank-threshold table and the points cheatsheet are duplicated, by hand,
 * in three languages: the web JSON/Vue source of truth, the iOS Swift app, and
 * the Android Kotlin app. THE FINALS re-tunes these values most seasons, and
 * nothing else stops the three copies from silently drifting (CI builds/tests
 * only web + server; the native packages aren't exercised here at all).
 *
 * This test reads the native source files directly and asserts they still match
 * the web source of truth verbatim, so any edit that touches one copy without
 * the others fails CI loudly. It does NOT compile Swift/Kotlin — it parses the
 * literal tables, which is enough to catch value/ordering drift.
 *
 * Sources of truth:
 *   - World Tour thresholds: packages/web/src/data/worldTourRanks.json
 *   - Ranked thresholds: packages/web/src/views/Ranked.vue (RANKED_THRESHOLDS)
 *   - cheatsheet: packages/web/src/components/PointsCheatsheet.vue (prop default)
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const read = (rel) => readFileSync(resolve(repoRoot, rel), 'utf8')

const SWIFT_RANK = 'packages/ios/Sources/SeasonSprint/Domain/Rank.swift'
const KOTLIN_RANK =
  'packages/android/app/src/main/java/com/lcarthur/seasonsprint/domain/Rank.kt'

// --- parsers (literal tables only; deliberately strict so format changes surface) ---

// Both native files now declare two threshold tables (World Tour + Ranked) using the
// same `Threshold(...)` literal syntax, so the threshold parsers must be scoped to one
// array declaration at a time rather than matching every `Threshold(...)` in the file.
// `open` is the exact text marking the start of the array body (e.g. `"= ["` or
// `"listOf("`), searched for *after* `arrayName` — not just the next bracket, since a
// Swift `[Threshold]` type annotation contains its own `[`/`]` before the real one.
function extractBlock(src, arrayName, open, close) {
  const start = src.indexOf(arrayName)
  if (start === -1) throw new Error(`could not find \`${arrayName}\` in source`)
  const openIdx = src.indexOf(open, start)
  if (openIdx === -1) throw new Error(`could not find \`${open}\` after \`${arrayName}\``)
  const bodyStart = openIdx + open.length
  const closeIdx = src.indexOf(`\n${close}`, bodyStart)
  if (closeIdx === -1) throw new Error(`could not find the \`${arrayName}\` array body`)
  return src.slice(bodyStart, closeIdx)
}

// Swift:  Threshold(badge: "Bronze 4", points: 25)
function parseSwiftThresholds(block) {
  return [...block.matchAll(/Threshold\(badge:\s*"([^"]+)",\s*points:\s*(\d+)\)/g)].map(
    (m) => ({ badge: m[1], points: Number(m[2]) })
  )
}

// Kotlin:  Threshold("Bronze 4", 25)   (the `data class` decl has no quote, so it won't match)
function parseKotlinThresholds(block) {
  return [...block.matchAll(/Threshold\("([^"]+)",\s*(\d+)\)/g)].map((m) => ({
    badge: m[1],
    points: Number(m[2]),
  }))
}

// Web:  { badge: 'Bronze 4', points: 0 }
function parseWebThresholds(block) {
  return [...block.matchAll(/badge:\s*'([^']+)',\s*points:\s*(\d+)/g)].map((m) => ({
    badge: m[1],
    points: Number(m[2]),
  }))
}

// Swift:  CheatsheetRow(label: "Lose the final round", value: 14)
function parseSwiftCheatsheet(src) {
  return [...src.matchAll(/CheatsheetRow\(label:\s*"([^"]+)",\s*value:\s*(\d+)\)/g)].map(
    (m) => ({ label: m[1], value: Number(m[2]) })
  )
}

// Kotlin:  CheatsheetRow("Lose the final round", 14)
function parseKotlinCheatsheet(src) {
  return [...src.matchAll(/CheatsheetRow\("([^"]+)",\s*(\d+)\)/g)].map((m) => ({
    label: m[1],
    value: Number(m[2]),
  }))
}

// Vue prop default:  default: () => ({ round1: 2, round2: 6, finalLose: 14, finalWin: 25 })
function parseVueCheatsheetValue(src, key) {
  const m = src.match(new RegExp(`${key}:\\s*(\\d+)`))
  return m ? Number(m[1]) : null
}

const jsonThresholds = JSON.parse(read('packages/web/src/data/worldTourRanks.json'))
const swiftSrc = read(SWIFT_RANK)
const kotlinSrc = read(KOTLIN_RANK)
const vueSrc = read('packages/web/src/components/PointsCheatsheet.vue')
const rankedVueSrc = read('packages/web/src/views/Ranked.vue')

const swiftWorldTourBlock = extractBlock(swiftSrc, 'let worldTourThresholds', '= [', ']')
const kotlinWorldTourBlock = extractBlock(kotlinSrc, 'val worldTourThresholds', 'listOf(', ')')
const swiftThresholds = parseSwiftThresholds(swiftWorldTourBlock)
const kotlinThresholds = parseKotlinThresholds(kotlinWorldTourBlock)
const swiftCheats = parseSwiftCheatsheet(swiftSrc)
const kotlinCheats = parseKotlinCheatsheet(kotlinSrc)

const swiftRankedBlock = extractBlock(swiftSrc, 'let rankedThresholds', '= [', ']')
const kotlinRankedBlock = extractBlock(kotlinSrc, 'val rankedThresholds', 'listOf(', ')')
const webRankedBlock = extractBlock(rankedVueSrc, 'RANKED_THRESHOLDS', '= [', ']')
const swiftRankedThresholds = parseSwiftThresholds(swiftRankedBlock)
const kotlinRankedThresholds = parseKotlinThresholds(kotlinRankedBlock)
const webRankedThresholds = parseWebThresholds(webRankedBlock)

describe('World Tour rank threshold parity (web JSON ↔ iOS ↔ Android)', () => {
  it('the JSON source of truth is non-empty and strictly ascending', () => {
    expect(jsonThresholds.length).toBeGreaterThan(0)
    for (let i = 1; i < jsonThresholds.length; i++) {
      expect(jsonThresholds[i].points).toBeGreaterThan(jsonThresholds[i - 1].points)
    }
  })

  // Guard: a regex that silently matched nothing must fail here, not pass a
  // vacuous comparison of two empty arrays elsewhere.
  it('parsers found the same number of thresholds as the JSON', () => {
    expect(swiftThresholds).toHaveLength(jsonThresholds.length)
    expect(kotlinThresholds).toHaveLength(jsonThresholds.length)
  })

  it('iOS Rank.swift matches the JSON verbatim (badge + points, in order)', () => {
    expect(swiftThresholds).toEqual(jsonThresholds)
  })

  it('Android Rank.kt matches the JSON verbatim (badge + points, in order)', () => {
    expect(kotlinThresholds).toEqual(jsonThresholds)
  })
})

describe('Ranked rank threshold parity (web Ranked.vue ↔ iOS ↔ Android)', () => {
  it('the web source of truth is non-empty and strictly ascending', () => {
    expect(webRankedThresholds.length).toBeGreaterThan(0)
    for (let i = 1; i < webRankedThresholds.length; i++) {
      expect(webRankedThresholds[i].points).toBeGreaterThan(webRankedThresholds[i - 1].points)
    }
  })

  // Guard: a regex that silently matched nothing must fail here, not pass a
  // vacuous comparison of two empty arrays elsewhere.
  it('parsers found the same number of thresholds as the web source', () => {
    expect(swiftRankedThresholds).toHaveLength(webRankedThresholds.length)
    expect(kotlinRankedThresholds).toHaveLength(webRankedThresholds.length)
  })

  it('iOS Rank.swift matches Ranked.vue verbatim (badge + points, in order)', () => {
    expect(swiftRankedThresholds).toEqual(webRankedThresholds)
  })

  it('Android Rank.kt matches Ranked.vue verbatim (badge + points, in order)', () => {
    expect(kotlinRankedThresholds).toEqual(webRankedThresholds)
  })
})

describe('World Tour cheatsheet parity (web Vue ↔ iOS ↔ Android)', () => {
  const keysInOrder = ['round1', 'round2', 'finalLose', 'finalWin']
  const vueValues = keysInOrder.map((k) => parseVueCheatsheetValue(vueSrc, k))

  it('parsers found a non-empty, equal-length cheatsheet on both clients', () => {
    expect(swiftCheats.length).toBe(keysInOrder.length)
    expect(kotlinCheats).toHaveLength(swiftCheats.length)
  })

  it('iOS and Android cheatsheets are identical (labels + values, in order)', () => {
    expect(swiftCheats).toEqual(kotlinCheats)
  })

  it('cheatsheet values match the web Vue prop defaults', () => {
    expect(vueValues.every((v) => typeof v === 'number')).toBe(true)
    expect(swiftCheats.map((r) => r.value)).toEqual(vueValues)
  })
})
