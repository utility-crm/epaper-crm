package com.epaperspace.publisher.di

import com.epaperspace.publisher.data.repository.DomainRepository
import com.epaperspace.publisher.ui.clickmask.ClickmaskEditorViewModel
import com.epaperspace.publisher.ui.domain.CustomDomainViewModel
import com.epaperspace.publisher.ui.settings.SettingsViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val settingsModule = module {
  single { DomainRepository(get(), get()) }

  viewModel { SettingsViewModel(get(), get()) }
  viewModel { CustomDomainViewModel(get()) }
  // Clickmasks are a content-worker concern, but the editor is a settings-shaped screen and
  // nothing else in contentModule needs it.
  viewModel { ClickmaskEditorViewModel(get()) }
}
