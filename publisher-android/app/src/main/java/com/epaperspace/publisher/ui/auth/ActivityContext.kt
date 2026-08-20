package com.epaperspace.publisher.ui.auth

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper

/**
 * Credential Manager and Firebase phone auth both need a real Activity, not an application
 * context. Compose only hands out a Context, so unwrap it here in one place.
 */
fun Context.findActivity(): Activity? {
  var context: Context? = this
  while (context is ContextWrapper) {
    if (context is Activity) return context
    context = context.baseContext
  }
  return null
}
