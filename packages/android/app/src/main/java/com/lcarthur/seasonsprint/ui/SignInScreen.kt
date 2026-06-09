package com.lcarthur.seasonsprint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import com.lcarthur.seasonsprint.R
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lcarthur.seasonsprint.auth.SignInViewModel

/**
 * Minimal email-code sign-in, mirroring the iOS SignInView: enter email → send code →
 * enter code → verify. On success the auth gate swaps to the dashboard automatically.
 */
@Composable
fun SignInScreen(viewModel: SignInViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            painter = painterResource(R.drawable.logo),
            contentDescription = null,
            modifier = Modifier
                .size(88.dp)
                .clip(RoundedCornerShape(20.dp)),
        )
        Text("Season Sprint", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Sign in to view your season progress",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (!state.codeSent) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email address") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { viewModel.sendCode(email) },
                enabled = email.isNotBlank() && !state.isWorking,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isWorking) CircularProgressIndicator(modifier = Modifier.height(20.dp))
                else Text("Send code")
            }
        } else {
            Text(
                "Enter the code sent to $email",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = code,
                onValueChange = { code = it },
                label = { Text("Verification code") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { viewModel.verify(code) },
                enabled = code.isNotBlank() && !state.isWorking,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isWorking) CircularProgressIndicator(modifier = Modifier.height(20.dp))
                else Text("Verify")
            }
            TextButton(onClick = {
                code = ""
                viewModel.reset()
            }) {
                Text("Use a different email")
            }
        }

        if (state.error != null) {
            Text(
                state.error!!,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
