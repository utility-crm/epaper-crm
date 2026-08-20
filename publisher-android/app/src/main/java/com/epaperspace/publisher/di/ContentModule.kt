package com.epaperspace.publisher.di

import com.epaperspace.publisher.data.repository.ContentRepository
import com.epaperspace.publisher.ui.dashboard.DashboardViewModel
import com.epaperspace.publisher.ui.editions.EditionsViewModel
import com.epaperspace.publisher.ui.papers.PapersViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val contentModule = module {
  single { ContentRepository(get(), get(), get()) }

  viewModel { DashboardViewModel(get(), get()) }
  viewModel { EditionsViewModel(get()) }
  viewModel { PapersViewModel(get()) }
}
