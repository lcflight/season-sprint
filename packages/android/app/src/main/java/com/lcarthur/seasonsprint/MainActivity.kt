package com.lcarthur.seasonsprint

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lcarthur.seasonsprint.auth.AuthState
import com.lcarthur.seasonsprint.auth.AuthViewModel
import com.lcarthur.seasonsprint.ui.MainScreen
import com.lcarthur.seasonsprint.ui.SignInScreen
import com.lcarthur.seasonsprint.ui.SignUpScreen
import com.lcarthur.seasonsprint.ui.theme.SeasonSprintTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SeasonSprintTheme {
                // Surface provides the dark background + correct default content color
                // (without it, unstyled Text falls back to black on the dark theme).
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    App()
                }
            }
        }
    }
}

@Composable
fun App(authViewModel: AuthViewModel = viewModel()) {
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    when (authState) {
        AuthState.Loading -> LoadingScreen()
        AuthState.SignedOut -> SignedOutGate()
        AuthState.SignedIn -> MainScreen(onSignOut = authViewModel::signOut)
    }
}

/** Signed-out flow: sign-in by default, with a local toggle over to sign-up and back. */
@Composable
private fun SignedOutGate() {
    var showSignUp by rememberSaveable { mutableStateOf(false) }
    if (showSignUp) {
        SignUpScreen(onSwitchToSignIn = { showSignUp = false })
    } else {
        SignInScreen(onSwitchToSignUp = { showSignUp = true })
    }
}

@Composable
private fun LoadingScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
    }
}
