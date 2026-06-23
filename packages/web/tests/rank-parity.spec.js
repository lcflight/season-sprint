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
 *   - thresholds: packages/web/src/data/worldTourRanks.json
 *   - cheatsheet: packages/web/src/components/PointsCheatsheet.vue (prop default)
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const read = (rel) => readFileSync(resolve(repoRoot, rel), 'utf8')

const SWIFT_RANK = 'packages/ios/Sources/SeasonSprint/Domain/Rank.swift'
const KOTLIN_RANK =
  'packages/android/app/src/main/java/com/lcarthur/seasonsprint/domain/Rank.kt'

// --- parsers (literal tables only; deliberately strict so format changes surface) ---

// Swift:  Threshold(badge: "Bronze 4", points: 25)
function parseSwiftThresholds(src) {
  return [...src.matchAll(/Threshold\(badge:\s*"([^"]+)",\s*points:\s*(\d+)\)/g)].map(
    (m) => ({ badge: m[1], points: Number(m[2]) })
  )
}

// Kotlin:  Threshold("Bronze 4", 25)   (the `data class` decl has no quote, so it won't match)
function parseKotlinThresholds(src) {
  return [...src.matchAll(/Threshold\("([^"]+)",\s*(\d+)\)/g)].map((m) => ({
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

const swiftThresholds = parseSwiftThresholds(swiftSrc)
const kotlinThresholds = parseKotlinThresholds(kotlinSrc)
const swiftCheats = parseSwiftCheatsheet(swiftSrc)
const kotlinCheats = parseKotlinCheatsheet(kotlinSrc)

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
