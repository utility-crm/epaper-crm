package com.epaperspace.publisher.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.ui.components.SecondaryButton

/** Dismissible failure banner. Tapping anywhere clears it, so there is no tiny close target. */
@Composable
fun ErrorBanner(message: String?, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
  if (message == null) return
  Box(
    modifier = modifier
      .fillMaxWidth()
      .clickable(onClick = onDismiss)
      .background(Color(0x1AEF4444), RoundedCornerShape(8.dp))
      .padding(horizontal = 14.dp, vertical = 12.dp),
  ) {
    Text(text = message, color = DestructiveRed, fontSize = 13.sp, lineHeight = 18.sp)
  }
}

/** Neutral informational banner (verification sent, already verified, and similar). */
@Composable
fun NoticeBanner(message: String?, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
  if (message == null) return
  Box(
    modifier = modifier
      .fillMaxWidth()
      .clickable(onClick = onDismiss)
      .background(Color(0x1E16A34A), RoundedCornerShape(8.dp))
      .padding(horizontal = 14.dp, vertical = 12.dp),
  ) {
    Text(
      text = message,
      color = com.epaperspace.publisher.theme.SuccessGreen,
      fontSize = 13.sp,
      lineHeight = 18.sp,
    )
  }
}

@Composable
fun AuthField(
  value: String,
  onValueChange: (String) -> Unit,
  label: String,
  modifier: Modifier = Modifier,
  error: String? = null,
  keyboardType: KeyboardType = KeyboardType.Text,
  isPassword: Boolean = false,
  enabled: Boolean = true,
  singleLine: Boolean = true,
) {
  OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = modifier.fillMaxWidth(),
    label = { Text(label) },
    isError = error != null,
    enabled = enabled,
    singleLine = singleLine,
    supportingText = error?.let { { Text(it, color = DestructiveRed) } },
    keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
    visualTransformation = if (isPassword) {
      PasswordVisualTransformation()
    } else {
      androidx.compose.ui.text.input.VisualTransformation.None
    },
    shape = RoundedCornerShape(8.dp),
  )
}

/** "or" rule between password auth and the federated options. */
@Composable
fun OrDivider(modifier: Modifier = Modifier) {
  Row(
    modifier = modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    HorizontalDivider(modifier = Modifier.weight(1f))
    Text("or", color = MutedForegroundLight, fontSize = 12.sp)
    HorizontalDivider(modifier = Modifier.weight(1f))
  }
}

/**
 * Google button. Rendered only when Firebase is actually configured — see FirebaseAuthClient,
 * which stays inert without google-services.json.
 */
@Composable
fun GoogleButton(
  onClick: () -> Unit,
  busy: Boolean,
  enabled: Boolean,
  modifier: Modifier = Modifier,
) {
  if (busy) {
    Box(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
      CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
    }
    return
  }
  SecondaryButton(
    text = "Continue with Google",
    onClick = onClick,
    enabled = enabled,
    modifier = modifier.fillMaxWidth(),
  )
}

/** Small text link used for the "no account? sign up" style footers. */
@Composable
fun AuthLink(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
  TextButton(onClick = onClick, modifier = modifier) {
    Text(text, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
  }
}
