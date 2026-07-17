package com.lcarthur.seasonsprint.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.onFailure
import com.clerk.api.network.serialization.onSuccess
import com.clerk.api.network.serialization.shortErrorMessageOrNull
import com.clerk.api.signin.resetPassword
import com.clerk.api.signin.sendResetPasswordCode
import com.clerk.api.signin.verifyCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Email + password sign-in with an email-code password-reset flow:
 *   - [signIn]        → Clerk.auth.signInWithPassword { identifier / password }
 *   - [sendResetCode] → Clerk.auth.signIn { email } then sendResetPasswordCode
 *   - [resetPassword] → currentSignIn.verifyCode(code) then resetPassword(newPassword)
 * On success Clerk's userFlow updates and [AuthViewModel] swaps the gate to the dashboard.
 */
class SignInViewModel : ViewModel() {

    data class UiState(
        val resetCodeSent: Boolean = false,
        val isWorking: Boolean = false,
        val error: String? = null,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState = _uiState.asStateFlow()

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            Clerk.auth.signInWithPassword {
                this.identifier = email.trim()
                this.password = password
            }
                // Clear state on success: the VM is activity-scoped and survives sign-out,
                // so a stale isWorking would leave the spinner running on the next visit.
                .onSuccess { _uiState.value = UiState() }
                .onFailure { failure ->
                    _uiState.update {
                        it.copy(
                            isWorking = false,
                            error = failure.shortErrorMessageOrNull()
                                ?: "Couldn't sign in. Check your email and password.",
                        )
                    }
                }
        }
    }

    fun sendResetCode(email: String) {
        if (email.isBlank()) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            Clerk.auth.signIn { this.email = email.trim() }
                .onSuccess { signIn ->
                    signIn.sendResetPasswordCode { this.email = email.trim() }
                        .onSuccess { _uiState.update { it.copy(isWorking = false, resetCodeSent = true) } }
                        .onFailure {
                            _uiState.update {
                                it.copy(isWorking = false, error = "Couldn't send a reset code. Try again.")
                            }
                        }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(isWorking = false, error = "Couldn't find an account with that email.")
                    }
                }
        }
    }

    fun resetPassword(code: String, newPassword: String) {
        val signIn = Clerk.auth.currentSignIn
        if (code.isBlank() || newPassword.isBlank() || signIn == null) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            signIn.verifyCode(code.trim())
                .onSuccess { verified ->
                    verified.resetPassword(newPassword)
                        .onSuccess { _uiState.value = UiState() }
                        .onFailure { failure ->
                            _uiState.update {
                                it.copy(
                                    isWorking = false,
                                    error = failure.shortErrorMessageOrNull()
                                        ?: "Couldn't set that password. Try a stronger one.",
                                )
                            }
                        }
                }
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
