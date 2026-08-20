package com.epaperspace.publisher.data.network

import android.util.Base64
import org.json.JSONObject

/**
 * Reads the claims out of a platform JWT. Decode only — the signature is the worker's business,
 * and nothing here is a security decision. It exists so the UI can hide controls the server would
 * refuse anyway (see [JwtClaims.permissions]) and so a token minted for another tenant or audience
 * is rejected before it is ever sent, exactly as the web portal does in App.tsx.
 */
object JwtDecoder {
  fun decode(token: String): JwtClaims? = runCatching {
    val payload = token.split('.').getOrNull(1) ?: return null
    val json = JSONObject(
      String(Base64.decode(payload, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
    )
    JwtClaims(
      aud = json.optStringOrNull("aud"),
      sub = json.optStringOrNull("sub"),
      tenantSlug = json.optStringOrNull("tenantSlug"),
      role = json.optStringOrNull("role"),
      userId = json.optStringOrNull("userId"),
      email = json.optStringOrNull("email"),
      permissions = json.optJSONArray("permissions")?.let { arr ->
        (0 until arr.length()).mapNotNull { arr.optString(it).takeIf(String::isNotBlank) }
      } ?: emptyList(),
      expSeconds = json.optLong("exp").takeIf { it > 0 },
    )
  }.getOrNull()

  private fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf(String::isNotBlank)
}

data class JwtClaims(
  val aud: String?,
  val sub: String?,
  val tenantSlug: String?,
  val role: String?,
  val userId: String?,
  val email: String?,
  val permissions: List<String>,
  val expSeconds: Long?,
) {
  val isExpired: Boolean
    get() = expSeconds?.let { it * 1000L <= System.currentTimeMillis() } ?: false

  /** The publisher portal audience. Reader and CRM tokens must not drive this app. */
  val isTenantPortal: Boolean get() = aud == AUD_TENANT_PORTAL

  companion object {
    const val AUD_TENANT_PORTAL = "tenant-portal"
  }
}
