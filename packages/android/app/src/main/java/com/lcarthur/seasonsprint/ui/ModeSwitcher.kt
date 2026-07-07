package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lcarthur.seasonsprint.GameMode
import com.lcarthur.seasonsprint.ui.theme.FinalsBg
import com.lcarthur.seasonsprint.ui.theme.FinalsGold
import com.lcarthur.seasonsprint.ui.theme.FinalsGoldBright

/** Segmented World Tour / Ranked pill, mirroring the web's ModeSwitcher.vue. */
@Composable
fun ModeSwitcher(
    selected: GameMode,
    onSelect: (GameMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        GameMode.entries.forEach { mode ->
            ModeSegment(
                label = mode.label,
                isSelected = mode == selected,
                onClick = { onSelect(mode) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ModeSegment(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .height(38.dp)
            .clip(RoundedCornerShape(10.dp))
            .then(
                if (isSelected) {
                    Modifier.background(Brush.verticalGradient(listOf(FinalsGold, FinalsGoldBright)))
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Black,
            color = if (isSelected) FinalsBg else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
