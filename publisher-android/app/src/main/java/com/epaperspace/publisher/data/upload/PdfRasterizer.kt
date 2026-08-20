package com.epaperspace.publisher.data.upload

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** One rasterized page on disk. Bytes live in files, never in memory. */
data class RasterizedPage(
  val pageNo: Int,
  val image: File,
  /** Only produced for paywalled pages — the reader shows this instead of the real page. */
  val blurred: File?,
  /** Page 1 only. */
  val cover: File?,
)

/**
 * Turns a PDF into per-page WebP files using the platform's own [PdfRenderer].
 *
 * The server has no PDF pipeline — `upload/page` takes images — so rasterization has to happen
 * here, exactly as pdf.js does it in the web portal.
 *
 * Memory is the binding constraint, not speed. A single 2000x2800 ARGB_8888 bitmap is ~22 MB, so
 * a 500-page paper can never be held in RAM. Pages are therefore rendered strictly one at a time,
 * written straight to [Context.getCacheDir], and recycled before the next page is touched.
 */
class PdfRasterizer(private val context: Context) {

  /** Page count without rendering anything, so the UI can validate before committing to work. */
  suspend fun pageCount(uri: Uri): Int = withContext(Dispatchers.IO) {
    openRenderer(uri).use { (_, renderer) -> renderer.pageCount }
  }

  /**
   * Renders every page in order, invoking [onPage] as each one lands so the caller can start
   * uploading without waiting for the whole document.
   *
   * [freePageCount] leading pages stay unblurred; the rest also get a blurred preview, matching
   * the paywall the reader enforces.
   */
  suspend fun rasterize(
    uri: Uri,
    freePageCount: Int,
    onProgress: (rendered: Int, total: Int) -> Unit = { _, _ -> },
    onPage: suspend (RasterizedPage) -> Unit,
  ) = withContext(Dispatchers.IO) {
    val workDir = File(context.cacheDir, "upload-${System.currentTimeMillis()}").apply { mkdirs() }

    openRenderer(uri).use { (_, renderer) ->
      val total = renderer.pageCount
      for (index in 0 until total) {
        val pageNo = index + 1
        val needsBlur = pageNo > freePageCount

        val page = renderPage(renderer, index, workDir, pageNo, needsBlur)
        onProgress(pageNo, total)
        onPage(page)
      }
    }
  }

  /** Callers must invoke this once a run finishes or is cancelled; cache is not self-cleaning. */
  fun discard(pages: Iterable<RasterizedPage>) {
    val dirs = mutableSetOf<File>()
    pages.forEach { page ->
      listOfNotNull(page.image, page.blurred, page.cover).forEach { file ->
        file.parentFile?.let(dirs::add)
        file.delete()
      }
    }
    // Only remove the directory once it is actually empty, so a concurrent run is never clobbered.
    dirs.forEach { dir -> if (dir.list()?.isEmpty() == true) dir.delete() }
  }

  private fun renderPage(
    renderer: PdfRenderer,
    index: Int,
    workDir: File,
    pageNo: Int,
    needsBlur: Boolean,
  ): RasterizedPage {
    var bitmap: Bitmap? = null
    try {
      val (width, height) = renderer.openPage(index).use { page ->
        val scale = TARGET_LONG_EDGE_PX.toFloat() / max(page.width, page.height).toFloat()
        // Never upscale a page that is already larger than the target; that only wastes bytes.
        val applied = if (scale < 1f) scale else 1f
        val w = (page.width * applied).roundToInt().coerceAtLeast(1)
        val h = (page.height * applied).roundToInt().coerceAtLeast(1)

        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply {
          // PdfRenderer composites onto whatever is already there, and a PDF's own background is
          // usually transparent. Without this fill, text renders onto black.
          eraseColor(Color.WHITE)
        }
        // Held in the outer var so `finally` recycles it even if render throws.
        bitmap = bmp
        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        w to h
      }

      val rendered = bitmap!!
      val image = File(workDir, "page-$pageNo.webp").also { rendered.writeWebp(it, PAGE_QUALITY) }
      val blurred = if (needsBlur) {
        File(workDir, "page-$pageNo-blur.webp").also { file ->
          rendered.blurred().let { blur ->
            blur.writeWebp(file, BLUR_QUALITY)
            blur.recycle()
          }
        }
      } else {
        null
      }
      val cover = if (pageNo == 1) {
        File(workDir, "cover.webp").also { rendered.writeWebp(it, PAGE_QUALITY) }
      } else {
        null
      }

      check(width > 0 && height > 0) { "Rendered page $pageNo with a zero dimension." }
      return RasterizedPage(pageNo, image, blurred, cover)
    } finally {
      // Recycle before the next page is opened; two full-size bitmaps alive at once is what
      // pushes a large document over the heap limit.
      bitmap?.recycle()
    }
  }

  /**
   * Downscale, box blur, upscale. RenderScript is deprecated and `RenderEffect` needs API 31,
   * below this app's minSdk floor, so the cheap classic trick is the one that actually ships.
   * Losing detail is the point — this is a paywall teaser, not a thumbnail.
   */
  private fun Bitmap.blurred(): Bitmap {
    val smallWidth = (width / BLUR_DOWNSCALE).coerceAtLeast(1)
    val smallHeight = (height / BLUR_DOWNSCALE).coerceAtLeast(1)

    val small = Bitmap.createScaledBitmap(this, smallWidth, smallHeight, true)
    val softened = small.boxBlur(BLUR_RADIUS)
    if (softened !== small) small.recycle()

    val upscaled = Bitmap.createScaledBitmap(softened, width, height, true)
    if (upscaled !== softened) softened.recycle()
    return upscaled
  }

  /** Separable box blur over the already-tiny bitmap, so an O(n·r) pass is cheap enough. */
  private fun Bitmap.boxBlur(radius: Int): Bitmap {
    if (radius <= 0) return this
    val w = width
    val h = height
    val pixels = IntArray(w * h)
    getPixels(pixels, 0, w, 0, 0, w, h)

    val horizontal = IntArray(w * h)
    blurAxis(pixels, horizontal, w, h, radius, horizontal = true)
    val vertical = IntArray(w * h)
    blurAxis(horizontal, vertical, w, h, radius, horizontal = false)

    return Bitmap.createBitmap(vertical, w, h, Bitmap.Config.ARGB_8888)
  }

  private fun blurAxis(
    source: IntArray,
    destination: IntArray,
    width: Int,
    height: Int,
    radius: Int,
    horizontal: Boolean,
  ) {
    val outer = if (horizontal) height else width
    val inner = if (horizontal) width else height

    for (o in 0 until outer) {
      for (i in 0 until inner) {
        var a = 0
        var r = 0
        var g = 0
        var b = 0
        var samples = 0

        for (offset in -radius..radius) {
          val at = i + offset
          if (at < 0 || at >= inner) continue
          val pixel = if (horizontal) source[o * width + at] else source[at * width + o]
          a += pixel ushr 24 and 0xFF
          r += pixel shr 16 and 0xFF
          g += pixel shr 8 and 0xFF
          b += pixel and 0xFF
          samples++
        }

        val index = if (horizontal) o * width + i else i * width + o
        destination[index] = (a / samples shl 24) or
          (r / samples shl 16) or
          (g / samples shl 8) or
          (b / samples)
      }
    }
  }

  private fun Bitmap.writeWebp(target: File, quality: Int) {
    FileOutputStream(target).use { out ->
      // WEBP_LOSSY needs API 30; the deprecated WEBP constant is the one that works on minSdk 24.
      @Suppress("DEPRECATION")
      val encoded = compress(Bitmap.CompressFormat.WEBP, quality, out)
      check(encoded) { "Could not encode ${target.name}." }
    }
  }

  private fun openRenderer(uri: Uri): AutoCloseablePair {
    val descriptor = context.contentResolver.openFileDescriptor(uri, "r")
      ?: error("Could not open the selected PDF. Pick the file again.")
    return AutoCloseablePair(descriptor, PdfRenderer(descriptor))
  }

  /** Renderer must close before its descriptor, so they are closed as a unit. */
  private class AutoCloseablePair(
    val descriptor: ParcelFileDescriptor,
    val renderer: PdfRenderer,
  ) : AutoCloseable {
    operator fun component1() = descriptor

    operator fun component2() = renderer

    override fun close() {
      renderer.close()
      descriptor.close()
    }
  }

  private companion object {
    /** Long edge in pixels. Matches what the web reader serves; larger just burns bandwidth. */
    const val TARGET_LONG_EDGE_PX = 2200

    const val PAGE_QUALITY = 82
    const val BLUR_QUALITY = 60
    const val BLUR_DOWNSCALE = 8
    const val BLUR_RADIUS = 3
  }
}
