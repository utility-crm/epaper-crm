package com.epaperspace.publisher

import com.epaperspace.publisher.data.Session
import com.epaperspace.publisher.data.TenantStatus
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The gate decides which graph a publisher sees. A wrong branch either strands a working account
 * on a dead-end screen or shows main-graph screens to an account the worker will refuse, so every
 * status the worker can return is pinned here.
 */
class NavigationGateTest {

  private fun session(status: String) =
    Session(token = "t", slug = "acme", status = status, claims = null)

  @Test
  fun `no session goes to auth`() {
    assertEquals(Gate.AUTH, (null as Session?).gate())
  }

  @Test
  fun `active tenant reaches the main graph`() {
    assertEquals(Gate.MAIN, session(TenantStatus.ACTIVE).gate())
  }

  @Test
  fun `unverified tenant is held at the verify screen`() {
    assertEquals(Gate.VERIFY, session(TenantStatus.AWAITING_VERIFICATION).gate())
  }

  @Test
  fun `every in-flight provisioning status waits on the provisioning screen`() {
    listOf(TenantStatus.PENDING, TenantStatus.PROVISIONING, TenantStatus.PROVISION_FAILED)
      .forEach { assertEquals(Gate.PROVISIONING, session(it).gate()) }
  }

  @Test
  fun `suspended tenant gets the suspended screen`() {
    assertEquals(Gate.SUSPENDED, session(TenantStatus.SUSPENDED).gate())
  }

  @Test
  fun `deleted tenants are treated as signed out rather than suspended`() {
    listOf(TenantStatus.DELETING, TenantStatus.DELETED)
      .forEach { assertEquals(Gate.AUTH, session(it).gate()) }
  }

  @Test
  fun `an unrecognised status is not allowed to strand the user`() {
    // A status this build has never heard of still has to land somewhere usable; the worker
    // re-checks every request, so falling through to MAIN is safe and PROVISIONING is not.
    assertEquals(Gate.MAIN, session("some_future_status").gate())
  }
}
