package com.epaperspace.publisher.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.theme.WarningOrange

/**
 * Every signed-in screen's chrome. The error banner lives here rather than in each screen so a
 * failed request always surfaces the same way and no screen can forget to show one.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
  title: String,
  modifier: Modifier = Modifier,
  onBack: (() -> Unit)? = null,
  error: String? = null,
  onDismissError: () -> Unit = {},
  loading: Boolean = false,
  scrollable: Boolean = true,
  actions: @Composable () -> Unit = {},
  bottomBar: @Composable () -> Unit = {},
  content: @Composable ColumnScope.() -> Unit,
) {
  Scaffold(
    modifier = modifier,
    topBar = {
      TopAppBar(
        title = { Text(title, fontWeight = FontWeight.SemiBold) },
        navigationIcon = {
          if (onBack != null) {
            IconButton(onClick = onBack) {
              Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
          }
        },
        actions = { actions() },
        colors = TopAppBarDefaults.topAppBarColors(
          containerColor = MaterialTheme.colorScheme.surface,
          titleContentColor = MaterialTheme.colorScheme.onSurface,
        ),
      )
    },
    bottomBar = bottomBar,
  ) { padding ->
    val body = Modifier
      .fillMaxSize()
      .padding(padding)
      .let { if (scrollable) it.verticalScroll(rememberScrollState()) else it }
      .padding(horizontal = 16.dp, vertical = 12.dp)

    Column(modifier = body, verticalArrangement = Arrangement.spacedBy(12.dp)) {
      if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
      Banner(error, onDismissError, DestructiveRed, 0x1AEF4444)
      content()
    }
  }
}

/** Tap-anywhere-to-dismiss notice. Colour carries the severity; the text carries the reason. */
@Composable
fun Banner(
  message: String?,
  onDismiss: () -> Unit,
  textColor: Color,
  backgroundArgb: Long,
  modifier: Modifier = Modifier,
) {
  if (message == null) return
  Box(
    modifier = modifier
      .fillMaxWidth()
      .clickable(onClick = onDismiss)
      .background(Color(backgroundArgb), RoundedCornerShape(8.dp))
      .padding(horizontal = 14.dp, vertical = 12.dp),
  ) {
    Text(text = message, color = textColor, fontSize = 13.sp, lineHeight = 18.sp)
  }
}

@Composable
fun SuccessBanner(message: String?, onDismiss: () -> Unit = {}) =
  Banner(message, onDismiss, SuccessGreen, 0x1E16A34A)

@Composable
fun WarningBanner(message: String?, onDismiss: () -> Unit = {}) =
  Banner(message, onDismiss, WarningOrange, 0x1FD97706)

/** Shown instead of an empty list, so a working screen never looks broken. */
@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier) {
  Box(
    modifier = modifier
      .fillMaxWidth()
      .padding(vertical = 40.dp),
    contentAlignment = Alignment.Center,
  ) {
    Text(text, color = MutedForegroundLight, fontSize = 14.sp)
  }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
  Text(
    text = text.uppercase(),
    modifier = modifier,
    color = MutedForegroundLight,
    fontSize = 11.sp,
    letterSpacing = 1.sp,
    fontWeight = FontWeight.SemiBold,
  )
}

@Composable
fun InlineSpinner(modifier: Modifier = Modifier) {
  Box(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
  }
}
