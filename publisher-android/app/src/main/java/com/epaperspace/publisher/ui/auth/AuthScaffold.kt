package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Full-screen auth layout. Every pre-session screen shares this so the red-and-white identity is
 * consistent and the branding lives in one place.
 */
@Composable
fun AuthScaffold(
  title: String,
  subtitle: String? = null,
  content: @Composable () -> Unit,
) {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .statusBarsPadding()
      .verticalScroll(rememberScrollState())
      .padding(horizontal = 24.dp, vertical = 32.dp),
    contentAlignment = Alignment.TopStart,
  ) {
    Column(modifier = Modifier.fillMaxWidth()) {
      Text(
        text = "EPAPERSPACE",
        color = MaterialTheme.colorScheme.primary,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 2.sp,
      )
      Spacer(Modifier.height(28.dp))
      Text(text = title, style = MaterialTheme.typography.headlineMedium)
      if (subtitle != null) {
        Spacer(Modifier.height(8.dp))
        Text(
          text = subtitle,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          fontSize = 14.sp,
          lineHeight = 20.sp,
          textAlign = TextAlign.Start,
        )
      }
      Spacer(Modifier.height(24.dp))
      content()
    }
  }
}
