package com.epaperspace.publisher.data

import com.epaperspace.publisher.data.local.TokenManager
import com.epaperspace.publisher.data.network.JwtClaims
import com.epaperspace.publisher.data.network.JwtDecoder
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/** Tenant lifecycle, as the provisioning worker reports it. */
object TenantStatus {
  const val PENDING = "pending"
  const val AWAITING_VERIFICATION = "awaiting_verification"
  const val PROVISIONING = "provisioning"
  const val PROVISION_FAILED = "provision_failed"
  const val ACTIVE = "active"
  const val SUSPENDED = "suspended"
  const val DELETING = "deleting"
  const val DELETED = "deleted"
}

data class Session(
  val token: String,
  val slug: String,
  val status: String,
  val claims: JwtClaims?,
) {
  val role: String? get() = claims?.role
  val email: String? get() = claims?.email

  val isActive: Boolean get() = status == TenantStatus.ACTIVE
  val isSuspended: Boolean get() = status == TenantStatus.SUSPENDED

  /**
   * Mirrors the web's client-side check for manual subscription grants: an explicit permissions
   * array wins when present, otherwise fall back to role. This only hides UI — the billing worker
   * re-decides on every request, so a stale token cannot grant anything.
   */
  fun canGrantSubscriptions(): Boolean {
    val perms = claims?.permissions ?: emptyList()
    if (perms.isNotEmpty()) return perms.contains("grant_subs")
    return role == "owner" || role == "admin"
  }
}

sealed interface SessionEvent {
  data object Unauthorized : SessionEvent

  data object TenantSuspended : SessionEvent

  data object TenantDeleted : SessionEvent
}

/**
 * Replaces the web portal's window CustomEvents. [ApiCaller] emits; the root composable collects
 * and reacts once for the whole app.
 */
class SessionEventBus {
  private val _events = MutableSharedFlow<SessionEvent>(extraBufferCapacity = 16)
  val events: SharedFlow<SessionEvent> = _events.asSharedFlow()

  fun emit(event: SessionEvent) {
    _events.tryEmit(event)
  }
}

/**
 * Single source of truth for "who is signed in and can they use the app yet". Persists through
 * [TokenManager] and exposes the current state reactively so gating is not re-derived per screen.
 */
class SessionManager(private val tokens: TokenManager) {

  private val _session = MutableStateFlow(restore())
  val session: StateFlow<Session?> = _session.asStateFlow()

  val current: Session? get() = _session.value

  /**
   * Accepts a freshly minted token. A token for the wrong audience is refused outright — the same
   * guard the web applies before trusting anything in localStorage.
   */
  fun sign(token: String, slug: String?, status: String?): Session? {
    val claims = JwtDecoder.decode(token)
    if (claims != null && !claims.isTenantPortal) return null

    val resolvedSlug = slug ?: claims?.tenantSlug ?: return null
    val resolvedStatus = status ?: tokens.tenantStatus ?: TenantStatus.ACTIVE

    tokens.save(token, resolvedSlug, resolvedStatus)
    return Session(token, resolvedSlug, resolvedStatus, claims).also { _session.value = it }
  }

  fun updateStatus(status: String) {
    tokens.saveTenantStatus(status)
    _session.value = _session.value?.copy(status = status)
  }

  fun signOut() {
    tokens.clear()
    _session.value = null
  }

  private fun restore(): Session? {
    val token = tokens.token ?: return null
    val claims = JwtDecoder.decode(token)

    // An expired or foreign-audience token is worthless; drop it rather than bouncing the user
    // off a 401 on their first action.
    if (claims == null || claims.isExpired || !claims.isTenantPortal) {
      tokens.clear()
      return null
    }
    val slug = tokens.slug ?: claims.tenantSlug ?: return null
    return Session(token, slug, tokens.tenantStatus ?: TenantStatus.ACTIVE, claims)
  }
}
