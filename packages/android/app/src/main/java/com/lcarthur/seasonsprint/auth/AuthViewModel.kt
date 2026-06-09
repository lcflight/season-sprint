package com.lcarthur.seasonsprint.auth

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.errorMessage
import com.clerk.api.network.serialization.onFailure
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Top-level auth state, mirroring the iOS ContentView gate (loading → signed-out → signed-in). */
sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data object SignedIn : AuthState
}

/**
 * Drives the auth gate by combining Clerk's initialization flag with its user flow.
 * Equivalent to iOS ContentView's `clerk.isLoaded` / `clerk.session` checks.
 */
class AuthViewModel : ViewModel() {
    val state = combine(Clerk.isInitialized, Clerk.userFlow) { isInitialized, user ->
        when {
            !isInitialized -> AuthState.Loading
            user != null -> AuthState.SignedIn
            else -> AuthState.SignedOut
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AuthState.Loading)

    fun signOut() {
        viewModelScope.launch {
            Clerk.auth.signOut()
                .onFailure { Log.e("AuthViewModel", "Sign-out failed: ${it.errorMessage}", it.throwable) }
        }
    }
}
