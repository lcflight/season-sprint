package com.lcarthur.seasonsprint

/**
 * Static configuration, mirroring the iOS app's Config.swift and the web app's env values.
 * - SERVER_URL: the deployed Cloudflare Worker.
 * - CLERK_PUBLISHABLE_KEY: the live Clerk key (shared across web + iOS + Android).
 */
object Config {
    const val SERVER_URL = "https://season-sprint-server.lcarthur747.workers.dev"
    const val CLERK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuc2Vhc29uc3ByaW50LmNvbSQ"
}
