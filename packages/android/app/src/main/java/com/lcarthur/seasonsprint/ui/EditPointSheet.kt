package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lcarthur.seasonsprint.domain.DateKey
import com.lcarthur.seasonsprint.domain.Point
import com.lcarthur.seasonsprint.state.DashboardViewModel

/** Bottom sheet to edit an existing record's date and value (`PUT /me/records/:id`). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditPointSheet(
    point: Point,
    viewModel: DashboardViewModel,
    onDismiss: () -> Unit,
) {
    var dateMillis by remember { mutableStateOf(DateKey.utcMillisFromDay(point.day) ?: DateKey.todayUtcMillis()) }
    var valueText by remember { mutableStateOf(point.winPoints.toString()) }
    var showDatePicker by remember { mutableStateOf(false) }
    val parsedValue = valueText.trim().toIntOrNull()

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Edit point", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)

            DateField(
                label = "Date",
                dateMillis = dateMillis,
                onClick = { showDatePicker = true },
            )
            WinPointsField(value = valueText, onValueChange = { valueText = it })

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                // Destructive delete lives here so the records list can lead with "Edit".
                TextButton(onClick = {
                    viewModel.deletePoint(point)
                    onDismiss()
                }) {
                    Text("Delete", color = androidx.compose.material3.MaterialTheme.colorScheme.error)
                }
                Row {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(
                        enabled = parsedValue != null,
                        onClick = {
                            parsedValue?.let {
                                viewModel.updatePoint(point, DateKey.dayStringFromUtcMillis(dateMillis), it)
                                onDismiss()
                            }
                        },
                    ) { Text("Save") }
                }
            }
        }
    }

    if (showDatePicker) {
        DatePickerModal(
            initialMillis = dateMillis,
            onConfirm = { millis -> millis?.let { dateMillis = it }; showDatePicker = false },
            onDismiss = { showDatePicker = false },
        )
    }
}
