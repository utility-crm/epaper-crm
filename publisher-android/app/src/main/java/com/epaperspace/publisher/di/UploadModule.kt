package com.epaperspace.publisher.di

import com.epaperspace.publisher.data.upload.EpaperUploader
import com.epaperspace.publisher.data.upload.PdfRasterizer
import com.epaperspace.publisher.ui.upload.UploadViewModel
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val uploadModule = module {
  single { PdfRasterizer(androidContext()) }
  single { EpaperUploader(get(), get()) }

  viewModel { UploadViewModel(get()) }
}
