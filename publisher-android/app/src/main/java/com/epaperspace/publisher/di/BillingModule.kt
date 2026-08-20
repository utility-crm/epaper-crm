package com.epaperspace.publisher.di

import com.epaperspace.publisher.data.repository.BillingRepository
import com.epaperspace.publisher.ui.payments.PaymentSetupViewModel
import com.epaperspace.publisher.ui.plans.ReaderPlansViewModel
import com.epaperspace.publisher.ui.platform.PlatformBillingViewModel
import com.epaperspace.publisher.ui.readers.ReadersViewModel
import com.epaperspace.publisher.ui.refunds.RefundsViewModel
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val billingModule = module {
  single { BillingRepository(get(), get(), get()) }

  viewModel { ReadersViewModel(get()) }
  viewModel { RefundsViewModel(get()) }
  // Reader tiers and plans are content-worker routes even though they are a money concern.
  viewModel { ReaderPlansViewModel(get()) }
  viewModel { PaymentSetupViewModel(get()) }
  viewModel { PlatformBillingViewModel(get()) }
}
