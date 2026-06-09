package com.lcarthur.seasonsprint.data

import com.clerk.api.Clerk
import com.clerk.api.network.serialization.onSuccess
import com.clerk.api.session.fetchToken

/** Bridges Clerk's session JWT into an `Authorization` header value. Mirrors iOS APIClient.authorizationHeader. */
object ClerkAuth {
    /** The current Clerk session JWT as a `Bearer …` header value, or null when signed out. */
    suspend fun bearerToken(): String? {
        val session = Clerk.session ?: return null
        var jwt: String? = null
        session.fetchToken().onSuccess { jwt = it.jwt }
        return jwt?.let { "Bearer $it" }
    }
}
