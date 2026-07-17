package com.lcarthur.seasonsprint.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.clerk.api.Clerk
import com.clerk.api.auth.types.VerificationType
import com.clerk.api.network.serialization.onFailure
import com.clerk.api.network.serialization.onSuccess
import com.clerk.api.network.serialization.shortErrorMessageOrNull
import com.clerk.api.signup.SignUp
import com.clerk.api.signup.sendEmailCode
import com.clerk.api.signup.verifyCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Two-step email + password sign-up, the registration counterpart of [SignInViewModel]:
 *   1. [sendCode] → Clerk.auth.signUp { email / password } then signUp.sendEmailCode()
 *   2. [verify]   → Clerk.auth.currentSignUp.verifyCode(code, EMAIL)
 * On success Clerk's userFlow updates and [AuthViewModel] swaps the gate to the dashboard.
 */
class SignUpViewModel : ViewModel() {

    data class UiState(
        val codeSent: Boolean = false,
        val isWorking: Boolean = false,
        val error: String? = null,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState = _uiState.asStateFlow()

    fun sendCode(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            Clerk.auth.signUp {
                this.email = email.trim()
                this.password = password
            }
                .onSuccess { signUp ->
                    signUp.sendEmailCode()
                        .onSuccess { _uiState.update { it.copy(isWorking = false, codeSent = true) } }
                        .onFailure {
                            _uiState.update {
                                it.copy(isWorking = false, error = "Couldn't send a code. Check the email and try again.")
                            }
                        }
                }
                .onFailure { failure ->
                    _uiState.update {
                        it.copy(
                            isWorking = false,
                            error = failure.shortErrorMessageOrNull()
                                ?: "Couldn't create an account with that email. It may already be in use.",
                        )
                    }
                }
        }
    }

    fun verify(code: String) {
        val signUp = Clerk.auth.currentSignUp
        if (code.isBlank() || signUp == null) return
        _uiState.update { it.copy(isWorking = true, error = null) }
        viewModelScope.launch {
            signUp.verifyCode(code.trim(), VerificationType.EMAIL)
                .onSuccess { result ->
                    if (result.status != SignUp.Status.COMPLETE) {
                        _uiState.update {
                            it.copy(isWorking = false, error = "Something's missing from the sign-up. Try again.")
                        }
                    } else {
                        // Clear state: the VM is activity-scoped and survives sign-out, so stale
                        // codeSent/isWorking would otherwise resurface on the next visit.
                        _uiState.value = UiState()
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
