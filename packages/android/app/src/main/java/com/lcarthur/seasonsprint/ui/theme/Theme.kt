package com.lcarthur.seasonsprint.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Fixed dark, THE FINALS-inspired scheme. Dynamic color is intentionally OFF so the brand
// identity is consistent across devices (the web/iOS apps are also fixed-theme).
private val FinalsColorScheme = darkColorScheme(
    primary = FinalsGold,
    onPrimary = FinalsBg,
    primaryContainer = FinalsSurfaceVariant,
    onPrimaryContainer = FinalsGold,
    secondary = FinalsCyan,
    onSecondary = FinalsBg,
    tertiary = FinalsMint,
    onTertiary = FinalsBg,
    background = FinalsBg,
    onBackground = FinalsText,
    surface = FinalsSurface,
    onSurface = FinalsText,
    surfaceVariant = FinalsSurfaceVariant,
    onSurfaceVariant = FinalsMuted,
    outline = FinalsOutline,
    outlineVariant = FinalsOutline,
    error = FinalsDanger,
    onError = FinalsBg,
)

@Composable
fun SeasonSprintTheme(
    // The app is dark-only by design; the param is kept for previews.
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            // Light icons on the dark brand bars.
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = FinalsColorScheme,
        typography = Typography,
        content = content,
    )
}
