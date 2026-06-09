package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lcarthur.seasonsprint.domain.DateKey
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.state.DashboardViewModel

/** Log tab: add/overwrite a point for a date, and an editable list of all records. */
@Composable
fun LogScreen(
    viewModel: DashboardViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    var newDateMillis by remember { mutableStateOf(DateKey.todayUtcMillis()) }
    var newValueText by remember { mutableStateOf("") }
    var showDatePicker by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Point?>(null) }
    val parsedNew = newValueText.trim().toIntOrNull()

    val recordsNewestFirst = state.points.sortedByDescending { it.instant }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Add point", style = MaterialTheme.typography.titleMedium)
                    DateField(label = "Date", dateMillis = newDateMillis, onClick = { showDatePicker = true })
                    WinPointsField(value = newValueText, onValueChange = { newValueText = it })
                    Button(
                        enabled = parsedNew != null && !state.isWriting,
                        onClick = {
                            parsedNew?.let {
                                viewModel.addOrSet(DateKey.dayStringFromUtcMillis(newDateMillis), it)
                                newValueText = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Save point") }
                    Text(
                        "Points are your cumulative season total. Saving a date that already exists overwrites it.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            Text("Records", style = MaterialTheme.typography.titleMedium)
        }

        if (recordsNewestFirst.isEmpty()) {
            item {
                Text(
                    "No records yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(recordsNewestFirst, key = { it.remoteId }) { point ->
                RecordRow(
                    point = point,
                    onEdit = { editing = point },
                    onDelete = { viewModel.deletePoint(point) },
                )
                HorizontalDivider()
            }
        }
    }

    if (showDatePicker) {
        DatePickerModal(
            initialMillis = newDateMillis,
            onConfirm = { millis -> millis?.let { newDateMillis = it }; showDatePicker = false },
            onDismiss = { showDatePicker = false },
        )
    }

    editing?.let { point ->
        EditPointSheet(point = point, viewModel = viewModel, onDismiss = { editing = null })
    }
}

@Composable
private fun RecordRow(point: Point, onEdit: () -> Unit, onDelete: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onEdit)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(point.day, style = MaterialTheme.typography.bodyLarge)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${point.winPoints}",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End,
            )
            TextButton(onClick = onDelete) { Text("Delete") }
        }
    }
}
