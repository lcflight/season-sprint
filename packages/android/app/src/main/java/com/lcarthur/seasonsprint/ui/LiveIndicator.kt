package com.lcarthur.seasonsprint.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lcarthur.seasonsprint.data.LiveStatus
import com.lcarthur.seasonsprint.ui.theme.FinalsGold
import com.lcarthur.seasonsprint.ui.theme.FinalsMint

/**
 * Live-link status as a database symbol. Renders nothing when there is no link;
 * amber and fading in/out while connecting; steady green once connected.
 */
@Composable
fun LiveIndicator(status: LiveStatus, modifier: Modifier = Modifier) {
    if (status == LiveStatus.Disconnected) return

    val alpha = if (status == LiveStatus.Connecting) {
        val transition = rememberInfiniteTransition(label = "live")
        val value by transition.animateFloat(
            initialValue = 0.25f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 900, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "live-alpha",
        )
        value
    } else {
        1f
    }

    val color = if (status == LiveStatus.Connected) FinalsMint else FinalsGold
    Icon(
        imageVector = Icons.Filled.Storage,
        contentDescription = if (status == LiveStatus.Connected) "Live updates connected" else "Connecting to live updates",
        tint = color.copy(alpha = alpha),
        modifier = modifier.size(16.dp),
    )
}
