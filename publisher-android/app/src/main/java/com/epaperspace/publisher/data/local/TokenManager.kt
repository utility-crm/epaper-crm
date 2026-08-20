package com.epaperspace.publisher.data.local

import android.content.Context
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted storage for the platform session. Holds what the web portal keeps in localStorage
 * (`epaper:orgToken`, `epaper:tenantStatus`) plus the tenant slug — the web re-derives that from
 * the hostname on every load, but an app has no host to read it from.
 */
class TokenManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "auth_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    val token: String? get() = prefs.getString(KEY_TOKEN, null)
    val slug: String? get() = prefs.getString(KEY_SLUG, null)
    val tenantStatus: String? get() = prefs.getString(KEY_STATUS, null)

    fun save(token: String, slug: String?, tenantStatus: String? = null) = prefs.edit {
        putString(KEY_TOKEN, token)
        if (slug != null) putString(KEY_SLUG, slug)
        if (tenantStatus != null) putString(KEY_STATUS, tenantStatus)
    }

    fun saveTenantStatus(status: String) = prefs.edit { putString(KEY_STATUS, status) }

    fun clear() = prefs.edit { clear() }

    private companion object {
        const val KEY_TOKEN = "jwt_token"
        const val KEY_SLUG = "tenant_slug"
        const val KEY_STATUS = "tenant_status"
    }
}
