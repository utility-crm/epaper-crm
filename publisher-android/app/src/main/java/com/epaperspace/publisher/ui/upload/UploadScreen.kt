package com.epaperspace.publisher.ui.upload

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.epaperspace.publisher.data.model.Epaper
import com.epaperspace.publisher.data.upload.PdfRasterizer
import com.epaperspace.publisher.data.upload.UploadService
import com.epaperspace.publisher.data.upload.UploadState
import com.epaperspace.publisher.theme.DestructiveRed
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.SuccessGreen
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.PublisherCard
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import com.epaperspace.publisher.ui.components.WarningBanner
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject

@Composable
fun UploadScreen(
  epaperId: String,
  epaperTitle: String,
  onBack: () -> Unit,
  viewModel: UploadViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val uploadState by viewModel.uploadState.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  // The rasterizer already knows how to count pages without rendering; reuse it rather than
  // opening a second PdfRenderer here.
  val rasterizer: PdfRasterizer = koinInject()

  var fileName by remember { mutableStateOf<String?>(null) }
  var pageCount by remember { mutableStateOf(0) }
  var freePages by remember { mutableStateOf("0") }

  LaunchedEffect(epaperId) { viewModel.setEpaper(epaperId) }

  val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
    if (uri == null) return@rememberLauncherForActivityResult
    scope.launch {
      val counted = runCatching { rasterizer.pageCount(uri) }.getOrNull()
      pageCount = counted ?: 0
      // A finished or failed run leaves the uploader in a terminal state, which would keep Start
      // disabled for the newly picked file.
      if (!uploadState.isRunning) viewModel.reset()

      if (counted == null || counted < 1 || counted > Epaper.MAX_PAGE_COUNT) {
        fileName = null
        // A null uri is how the ViewModel marks a pick unusable; nothing can be started from it.
        viewModel.setPdf(null, 0)
      } else {
        fileName = uri.lastPathSegment
        viewModel.setPdf(uri, freePages.toFreePages(counted))
      }
    }
  }

  val inProgress = uploadState.isRunning
  val canStart = state.uri != null &&
    !state.invalidPdf &&
    (uploadState is UploadState.Idle || uploadState is UploadState.Failed)

  AppScaffold(
    title = epaperTitle,
    onBack = onBack,
    error = state.error,
    onDismissError = viewModel::dismissError,
  ) {
    WarningBanner(
      "Uploading replaces every page this paper already has. The existing pages are deleted " +
        "before the new ones go up.",
    )

    PublisherCard {
      SectionLabel("PDF")
      Text(
        text = fileName ?: "No file chosen",
        fontSize = 15.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.fillMaxWidth(),
      )
      if (pageCount > 0 && !state.invalidPdf) {
        Text("$pageCount pages", color = MutedForegroundLight, fontSize = 12.sp)
      }
      if (state.invalidPdf) {
        Text(
          text = "That file could not be read as a PDF, or it has more than " +
            "${Epaper.MAX_PAGE_COUNT} pages. Pick a different file.",
          color = DestructiveRed,
          fontSize = 13.sp,
        )
      }
      SecondaryButton(
        text = if (fileName == null) "Choose PDF" else "Choose a different PDF",
        onClick = { picker.launch(arrayOf("application/pdf")) },
        enabled = !inProgress,
        modifier = Modifier.fillMaxWidth(),
      )
    }

    PublisherCard {
      SectionLabel("Paywall")
      OutlinedTextField(
        value = freePages,
        onValueChange = { input ->
          val digits = input.filter(Char::isDigit)
          freePages = digits
          // Re-arm the run so a changed allowance is the one the upload actually uses.
          state.uri?.let { viewModel.setPdf(it, digits.toFreePages(pageCount)) }
        },
        label = { Text("Free pages") },
        enabled = !inProgress,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth(),
      )
      Text(
        text = "Pages after this count are uploaded blurred for readers without access.",
        color = MutedForegroundLight,
        fontSize = 12.sp,
      )
    }

    UploadProgress(uploadState)

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      PrimaryButton(
        text = if (uploadState is UploadState.Failed) "Retry upload" else "Start upload",
        // The run has to outlive this screen — minutes of work would be killed with the process
        // if it were launched from the ViewModel, so it goes through the foreground service.
        onClick = {
          state.uri?.let { uri ->
            UploadService.start(context, epaperId, uri, state.freePageCount)
          }
        },
        enabled = canStart,
        modifier = Modifier.weight(1f),
      )
      if (inProgress) {
        SecondaryButton(
          text = "Cancel",
          onClick = { UploadService.cancel(context) },
          modifier = Modifier.weight(1f),
        )
      }
    }
  }
}

@Composable
private fun UploadProgress(uploadState: UploadState) {
  if (uploadState is UploadState.Idle) return

  PublisherCard {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      when (uploadState) {
        UploadState.Idle -> Unit

        UploadState.Preparing -> {
          Text("Preparing…", fontWeight = FontWeight.Medium)
          LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        is UploadState.Rendering -> Step(
          label = "Rendering page ${uploadState.done} of ${uploadState.total}",
          done = uploadState.done,
          total = uploadState.total,
        )

        is UploadState.Uploading -> Step(
          label = "Uploading page ${uploadState.done} of ${uploadState.total}",
          done = uploadState.done,
          total = uploadState.total,
        )

        UploadState.Committing -> {
          Text("Finishing up…", fontWeight = FontWeight.Medium)
          LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        UploadState.Done -> Text(
          text = "Upload complete. The paper's pages have been replaced.",
          color = SuccessGreen,
          fontWeight = FontWeight.Medium,
        )

        is UploadState.Failed -> {
          Text("Upload failed", color = DestructiveRed, fontWeight = FontWeight.Medium)
          Text(uploadState.message, color = MutedForegroundLight, fontSize = 13.sp)
        }
      }
    }
  }
}

@Composable
private fun Step(label: String, done: Int, total: Int) {
  Text(label, fontWeight = FontWeight.Medium)
  LinearProgressIndicator(
    progress = { if (total > 0) done.toFloat() / total.toFloat() else 0f },
    modifier = Modifier.fillMaxWidth(),
  )
}

/**
 * The ViewModel reuses its `invalidPdf` flag for an allowance above [Epaper.MAX_PAGE_COUNT], which
 * would show the "unreadable file" error for what is really a typo in this field. Clamping to the
 * document's own page count keeps that branch reachable only by a genuinely bad file — and a free
 * allowance larger than the document is meaningless anyway.
 */
private fun String.toFreePages(pageCount: Int): Int =
  (toIntOrNull() ?: 0).coerceIn(0, pageCount)

private val UploadState.isRunning: Boolean
  get() = this is UploadState.Preparing ||
    this is UploadState.Rendering ||
    this is UploadState.Uploading ||
    this is UploadState.Committing
