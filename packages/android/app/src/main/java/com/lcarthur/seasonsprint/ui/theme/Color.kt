package com.lcarthur.seasonsprint.ui.theme

import androidx.compose.ui.graphics.Color
import com.lcarthur.seasonsprint.domain.tierKey

// THE FINALS-inspired brand palette, matching the web app (packages/web/src/assets/theme.css).
val FinalsBg = Color(0xFF0B0D12)            // near-black blue base
val FinalsSurface = Color(0xFF12151D)        // card / raised surfaces
val FinalsSurfaceVariant = Color(0xFF1E2430) // elevated chips / inputs
val FinalsText = Color(0xFFD7DDE7)           // primary text
val FinalsTextStrong = Color(0xFFFFFFFF)     // titles
val FinalsMuted = Color(0xFF8B93A7)          // subdued labels
val FinalsOutline = Color(0xFF2A3140)

val FinalsGold = Color(0xFFFFD400)           // primary accent
val FinalsGoldBright = Color(0xFFFFEA00)
val FinalsCyan = Color(0xFF4FD1FF)           // chart accent
val FinalsMint = Color(0xFF22D3A3)           // success
val FinalsDanger = Color(0xFFFF3D7F)         // errors / points
val BrandRed = Color(0xFFCE2C30)             // logo background

// Rank tier palette — ported from packages/ios .../Views/RankBadgeView.swift.
val RankBronze = Color(0xFFCC8033)
val RankSilver = Color(0xFFBFBFCC)
val RankGold = Color(0xFFF2C733)
val RankPlatinum = Color(0xFF80CCD9)
val RankDiamond = Color(0xFF73A6F2)
val RankEmerald = Color(0xFF33CC8C)
val RankUnranked = Color(0xFF8A8A8A)

/** Accent color for a rank badge (e.g. "Gold 2" → gold). */
fun rankColor(badge: String): Color = when (tierKey(badge)) {
    "bronze" -> RankBronze
    "silver" -> RankSilver
    "gold" -> RankGold
    "platinum" -> RankPlatinum
    "diamond" -> RankDiamond
    "emerald" -> RankEmerald
    else -> RankUnranked
}
