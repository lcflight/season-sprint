package com.lcarthur.seasonsprint.data

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the current Clerk session JWT as a Bearer token to every request.
 * Public endpoints (e.g. `GET /seasons`) simply ignore it. Runs on OkHttp's
 * background dispatcher thread, so blocking for the token here is safe.
 */
class AuthInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val bearer = runBlocking { ClerkAuth.bearerToken() }
        val authed = if (bearer != null) {
            request.newBuilder().header("Authorization", bearer).build()
        } else {
            request
        }
        return chain.proceed(authed)
    }
}
