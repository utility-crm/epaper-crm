package com.epaperspace.publisher.ui.clickmask

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.ImageLoader
import coil3.compose.AsyncImage
import com.epaperspace.publisher.BuildConfig
import com.epaperspace.publisher.data.SessionManager
import com.epaperspace.publisher.data.model.Clickmask
import com.epaperspace.publisher.theme.MutedForegroundLight
import com.epaperspace.publisher.theme.PrimaryRed
import com.epaperspace.publisher.ui.components.AppScaffold
import com.epaperspace.publisher.ui.components.EmptyState
import com.epaperspace.publisher.ui.components.PrimaryButton
import com.epaperspace.publisher.ui.components.SecondaryButton
import com.epaperspace.publisher.ui.components.SectionLabel
import org.koin.androidx.compose.koinViewModel
import org.koin.compose.koinInject
import kotlin.math.abs
import kotlin.math.min

/** A tap wobbles a few pixels; below this a drag is not an intentional rectangle. */
private const val MIN_DRAG_PX = 8f

@Composable
fun ClickmaskEditorScreen(
  epaperId: String,
  pageCount: Int,
  onBack: () -> Unit,
  viewModel: ClickmaskEditorViewModel = koinViewModel(),
) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  val sessions = koinInject<SessionManager>()
  val session by sessions.session.collectAsStateWithLifecycle()
  val loader = koinInject<ImageLoader>()

  LaunchedEffect(epaperId) { viewModel.load(epaperId) }

  AppScaffold(
    title = "Clickmasks",
    onBack = onBack,
    error = state.error,
    onDismissError = viewModel::dismissError,
    loading = state.loading,
    scrollable = false,
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      SecondaryButton(
        text = "Prev",
        onClick = { viewModel.selectPage(state.pageNo - 1) },
        enabled = state.pageNo > 1,
      )
      Text(
        text = "Page ${state.pageNo} of $pageCount",
        modifier = Modifier.weight(1f),
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.bodyMedium,
      )
      SecondaryButton(
        text = "Next",
        onClick = { viewModel.selectPage(state.pageNo + 1) },
        enabled = state.pageNo < pageCount,
      )
    }

    val slug = session?.slug
    if (slug == null) {
      EmptyState("Session expired.")
      return@AppScaffold
    }

    // Indices address the current page's list, so a page switch invalidates any open dialog.
    var editing by remember(state.pageNo) { mutableStateOf<Int?>(null) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    var dragStart by remember { mutableStateOf(Offset.Zero) }
    var dragEnd by remember { mutableStateOf<Offset?>(null) }

    Box(modifier = Modifier.fillMaxWidth()) {
      AsyncImage(
        model = "${BuildConfig.API_BASE_URL}api/content/$slug/epapers/$epaperId" +
          "/pages/${state.pageNo}/image",
        contentDescription = "Page ${state.pageNo}",
        imageLoader = loader,
        contentScale = ContentScale.FillWidth,
        modifier = Modifier
          .fillMaxWidth()
          .onSizeChanged { size = it },
      )

      Canvas(
        modifier = Modifier
          .matchParentSize()
          .pointerInput(size) {
            detectDragGestures(
              onDragStart = {
                dragStart = it
                dragEnd = it
              },
              onDrag = { change, amount ->
                change.consume()
                dragEnd = (dragEnd ?: dragStart) + amount
              },
              onDragCancel = { dragEnd = null },
              onDragEnd = {
                val end = dragEnd
                dragEnd = null
                val w = if (end == null) 0f else abs(end.x - dragStart.x)
                val h = if (end == null) 0f else abs(end.y - dragStart.y)
                if (end != null && size.width > 0 && size.height > 0 &&
                  w >= MIN_DRAG_PX && h >= MIN_DRAG_PX
                ) {
                  viewModel.addMask(
                    Clickmask(
                      x = (min(dragStart.x, end.x) / size.width).toDouble(),
                      y = (min(dragStart.y, end.y) / size.height).toDouble(),
                      width = (w / size.width).toDouble(),
                      height = (h / size.height).toDouble(),
                    ),
                  )
                }
              },
            )
          },
      ) {
        val stroke = Stroke(width = 2.dp.toPx())
        state.masks.forEach { mask ->
          drawRect(
            color = PrimaryRed,
            topLeft = Offset(
              (mask.x * this.size.width).toFloat(),
              (mask.y * this.size.height).toFloat(),
            ),
            size = Size(
              (mask.width * this.size.width).toFloat(),
              (mask.height * this.size.height).toFloat(),
            ),
            style = stroke,
          )
        }
        dragEnd?.let { end ->
          drawRect(
            color = PrimaryRed,
            topLeft = Offset(min(dragStart.x, end.x), min(dragStart.y, end.y)),
            size = Size(abs(end.x - dragStart.x), abs(end.y - dragStart.y)),
            style = stroke,
          )
        }
      }
    }

    SectionLabel("Masks on this page")
    if (state.masks.isEmpty()) {
      EmptyState("Drag on the page to draw a mask.")
    } else {
      LazyColumn(
        modifier = Modifier
          .fillMaxWidth()
          .weight(1f),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        itemsIndexed(state.masks) { index, mask ->
          MaskRow(index = index, mask = mask, onClick = { editing = index })
        }
      }
    }

    PrimaryButton(
      text = if (state.saving) "Saving…" else "Save",
      onClick = viewModel::save,
      modifier = Modifier.fillMaxWidth(),
      enabled = state.dirty && !state.saving,
    )

    editing?.let { index ->
      val mask = state.masks.getOrNull(index)
      if (mask == null) {
        editing = null
      } else {
        LinkDialog(
          mask = mask,
          onDismiss = { editing = null },
          onSave = { href, label ->
            viewModel.setLink(index, href, label)
            editing = null
          },
          onDelete = {
            viewModel.removeMask(index)
            editing = null
          },
        )
      }
    }
  }
}

@Composable
private fun MaskRow(index: Int, mask: Clickmask, onClick: () -> Unit) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onClick)
      .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
      .padding(horizontal = 12.dp, vertical = 10.dp),
  ) {
    Text(
      text = "${index + 1}. ${mask.label ?: "Untitled"}",
      fontWeight = FontWeight.Medium,
      fontSize = 14.sp,
    )
    Text(
      text = mask.href ?: "No link",
      color = MutedForegroundLight,
      fontSize = 12.sp,
    )
  }
}

@Composable
private fun LinkDialog(
  mask: Clickmask,
  onDismiss: () -> Unit,
  onSave: (String?, String?) -> Unit,
  onDelete: () -> Unit,
) {
  var href by remember(mask) { mutableStateOf(mask.href.orEmpty()) }
  var label by remember(mask) { mutableStateOf(mask.label.orEmpty()) }

  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Link") },
    text = {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
          value = href,
          onValueChange = { href = it },
          label = { Text("URL") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
          value = label,
          onValueChange = { label = it },
          label = { Text("Label") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
      }
    },
    confirmButton = {
      TextButton(onClick = { onSave(href, label.trim().ifBlank { null }) }) { Text("Save") }
    },
    dismissButton = {
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = onDelete) { Text("Delete", color = PrimaryRed) }
        TextButton(onClick = onDismiss) { Text("Cancel") }
      }
    },
  )
}
