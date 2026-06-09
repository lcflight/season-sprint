package com.lcarthur.seasonsprint.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.onFailure
import com.clerk.api.network.serialization.onSuccess
import com.clerk.api.signin.verifyCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Two-step email-code sign-in, mirroring the iOS SignInView:
 *   1. [sendCode] → Clerk.auth.signInWithOtp { email = … }
 *   2. [verify]   → Clerk.auth.currentSignIn.verifyCode(code)
 * On success Clerk's userFlow updates and [AuthViewModel] swaps the gate to the dashboard.
 */
class SignInViewModel : ViewModel() {

    data class UiState(
        val codeSent: Boolean = false,
        val isWorking: Boolean = false,
        val error: String? = null,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState = _uiState.asStateFlow()

    fun sendCode(email: String) {
        if (email.isBlank()) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            Clerk.auth.signInWithOtp { this.email = email.trim() }
                .onSuccess { _uiState.update { it.copy(isWorking = false, codeSent = true) } }
                .onFailure {
                    _uiState.update {
                        it.copy(isWorking = false, error = "Couldn't send a code. Check the email and try again.")
                    }
                }
        }
    }

    fun verify(code: String) {
        val signIn = Clerk.auth.currentSignIn
        if (code.isBlank() || signIn == null) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            signIn.verifyCode(code.trim())
                .onSuccess { /* gate switches automatically via userFlow */ }
                .onFailure {
                    _uiState.update {
                        it.copy(isWorking = false, error = "That code didn't work. Try again.")
                    }
                }
        }
    }

    fun reset() {
        _uiState.value = UiState()
    }
}
