package com.lcarthur.seasonsprint

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lcarthur.seasonsprint.auth.AuthState
import com.lcarthur.seasonsprint.auth.AuthViewModel
import com.lcarthur.seasonsprint.ui.MainScreen
import com.lcarthur.seasonsprint.ui.SignInScreen
import com.lcarthur.seasonsprint.ui.theme.SeasonSprintTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SeasonSprintTheme {
                App()
            }
        }
    }
}

@Composable
fun App(authViewModel: AuthViewModel = viewModel()) {
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    when (authState) {
        AuthState.Loading -> LoadingScreen()
        AuthState.SignedOut -> SignInScreen()
        AuthState.SignedIn -> MainScreen(onSignOut = authViewModel::signOut)
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
