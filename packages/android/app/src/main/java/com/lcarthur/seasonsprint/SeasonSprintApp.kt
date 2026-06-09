package com.lcarthur.seasonsprint

import android.app.Application
import com.clerk.api.Clerk

/**
 * Application entry point. Clerk must be initialized before anything touches its flows,
 * so we do it here (mirrors the iOS app's Clerk.configure in SeasonSprintApp.init).
 */
class SeasonSprintApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Clerk.initialize(this, Config.CLERK_PUBLISHABLE_KEY)
    }
}
