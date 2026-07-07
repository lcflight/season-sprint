package com.lcarthur.seasonsprint

/** Which game mode a records/season view is scoped to. Mirrors the server's `GameMode` type. */
enum class GameMode(val wireValue: String, val prefsSuffix: String, val label: String) {
    WorldTour("world-tour", "worldTour", "World Tour"),
    Ranked("ranked", "ranked", "Ranked"),
}
