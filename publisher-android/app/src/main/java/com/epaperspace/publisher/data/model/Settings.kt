package com.epaperspace.publisher.data.model

import com.google.gson.annotations.SerializedName

/** Org settings, branding and the reader-facing surface the publisher controls. */
data class OrgSettings(
  @SerializedName("org_name") val orgName: String? = null,
  val slug: String? = null,
  @SerializedName("reader_theme") val readerTheme: String? = null,
  @SerializedName("reader_auth_email_enabled") val readerAuthEmailEnabled: Boolean = true,
  @SerializedName("reader_auth_otp_enabled") val readerAuthOtpEnabled: Boolean = false,
  @SerializedName("reader_auth_otp_only") val readerAuthOtpOnly: Boolean = false,
  @SerializedName("footer_links") val footerLinks: String? = null,
  @SerializedName("social_facebook") val socialFacebook: String? = null,
  @SerializedName("social_twitter") val socialTwitter: String? = null,
  @SerializedName("social_instagram") val socialInstagram: String? = null,
  @SerializedName("social_youtube") val socialYoutube: String? = null,
  @SerializedName("social_linkedin") val socialLinkedin: String? = null,
) {
  companion object {
    /**
     * Theme ids the settings screen writes. Note the reader app matches on `theme-`-prefixed
     * class names, so these are the bare ids as stored.
     */
    val READER_THEMES = listOf("modern", "classic", "bold", "minimal")
  }
}

/** PATCH body — every field nullable so a partial update never clobbers a sibling setting. */
data class UpdateSettingsRequest(
  @SerializedName("org_name") val orgName: String? = null,
  @SerializedName("reader_theme") val readerTheme: String? = null,
  @SerializedName("reader_auth_email_enabled") val readerAuthEmailEnabled: Boolean? = null,
  @SerializedName("reader_auth_otp_enabled") val readerAuthOtpEnabled: Boolean? = null,
  @SerializedName("reader_auth_otp_only") val readerAuthOtpOnly: Boolean? = null,
  @SerializedName("footer_links") val footerLinks: String? = null,
  @SerializedName("social_facebook") val socialFacebook: String? = null,
  @SerializedName("social_twitter") val socialTwitter: String? = null,
  @SerializedName("social_instagram") val socialInstagram: String? = null,
  @SerializedName("social_youtube") val socialYoutube: String? = null,
  @SerializedName("social_linkedin") val socialLinkedin: String? = null,
)

/** Custom reader domain. Publishers CNAME to epaper-reader.pages.dev; Cloudflare issues the cert. */
data class DomainInfo(
  val domain: String? = null,
  val verified: Boolean = false,
  val status: String? = null,
  @SerializedName("ssl_status") val sslStatus: String? = null,
)

data class DomainRequest(val domain: String)
