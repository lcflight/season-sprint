package com.lcarthur.seasonsprint.state

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.clerk.api.Clerk
import com.lcarthur.seasonsprint.GameMode
import com.lcarthur.seasonsprint.data.ApiClient
import com.lcarthur.seasonsprint.domain.DateKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class OnboardingState(
    /** null until the check completes, so the caller can hold the dashboard back. */
    val isNeeded: Boolean? = null,
    val isSaving: Boolean = false,
    val error: String? = null,
)

/**
 * Decides whether to show the first-launch "enter your current totals" prompt, and saves what
 * the user enters as today's record in each mode. Mirrors iOS OnboardingStore.
 *
 * A user is considered new when they have no records at all, in either mode — detection is
 * server-side so it holds across devices and platforms, rather than re-prompting after every
 * reinstall. The resolved flag marks onboarding as settled by any route — saved, skipped, or
 * found to already have records — so later launches skip the probe entirely instead of
 * refetching every mode just to rediscover the user isn't new.
 *
 * That flag is scoped per user id: signing out leaves it behind, so a single global key would
 * let the first account to resolve onboarding silently suppress it for anyone who signs in on
 * the device afterwards — dropping a genuinely new user onto a zero graph.
 */
class OnboardingViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Per-user key, or null if the signed-in user can't be identified — in which case we fail
     * safe by probing rather than trusting a flag that may belong to another account.
     */
    private val resolvedKey: String?
        get() = Clerk.userFlow.value?.id?.let { "$KEY_RESOLVED.$it" }

    private val _state = MutableStateFlow(OnboardingState())
    val state = _state.asStateFlow()

    init {
        check()
    }

    private fun check() {
        if (resolvedKey?.let { prefs.getBoolean(it, false) } == true) {
            _state.update { it.copy(isNeeded = false) }
            return
        }
        viewModelScope.launch {
            val needed = try {
                GameMode.entries.all { ApiClient.getRecords(it).isEmpty() }
            } catch (e: Exception) {
                // Never let a failed probe block the app — fall through to the dashboard,
                // which surfaces its own load error if the API is genuinely down.
                false
            }
            if (!needed) {
                // Already has data, so they're settled — record that so later launches skip
                // this probe instead of re-asking the server every time.
                markResolved()
            }
            _state.update { it.copy(isNeeded = needed) }
        }
    }

    /**
     * Persist the totals the user filled in as today's record, one per mode. [values] only
     * carries the modes they actually entered — a player who only plays one mode shouldn't get
     * a phantom 0 in the other, which would anchor that mode's graph and pace at zero.
     */
    fun save(values: Map<GameMode, Int>) {
        _state.update { it.copy(isSaving = true, error = null) }
        viewModelScope.launch {
            try {
                val today = DateKey.today()
                values.forEach { (mode, winPoints) ->
                    ApiClient.upsertRecord(today, winPoints, mode)
                }
                dismiss()
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, error = "Could not save. Please try again.") }
            }
        }
    }

    fun skip() = dismiss()

    private fun dismiss() {
        markResolved()
        _state.update { it.copy(isNeeded = false, isSaving = false, error = null) }
    }

    private fun markResolved() {
        resolvedKey?.let { prefs.edit().putBoolean(it, true).apply() }
    }

    class Factory(private val app: Application) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
            OnboardingViewModel(app) as T
    }

    private companion object {
        const val PREFS = "onboarding"
        const val KEY_RESOLVED = "onboarding.resolved"
    }
}
