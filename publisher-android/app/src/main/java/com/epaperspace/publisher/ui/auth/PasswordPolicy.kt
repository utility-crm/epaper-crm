package com.epaperspace.publisher.ui.auth

/**
 * Mirrors the worker's rule (min 8 chars, at least one uppercase and one digit) so a rejection is
 * shown before a round trip. The server remains the authority; this only saves the user a trip.
 */
object PasswordPolicy {
  const val MIN_LENGTH = 8
  const val DESCRIPTION = "At least 8 characters, with one uppercase letter and one number."

  /** Null when acceptable, otherwise the reason to show under the field. */
  fun validate(password: String): String? = when {
    password.length < MIN_LENGTH -> "Use at least $MIN_LENGTH characters."
    password.none(Char::isUpperCase) -> "Add an uppercase letter."
    password.none(Char::isDigit) -> "Add a number."
    else -> null
  }

  fun isValid(password: String): Boolean = validate(password) == null
}

/** Cheap sanity check — the server does the real validation. */
fun String.looksLikeEmail(): Boolean {
  val at = indexOf('@')
  return at > 0 && indexOf('.', at) > at + 1 && !contains(' ') && last() != '.'
}
