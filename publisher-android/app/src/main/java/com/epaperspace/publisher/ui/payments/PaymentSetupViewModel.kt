package com.epaperspace.publisher.ui.payments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.RazorpayConfig
import com.epaperspace.publisher.data.model.RazorpayConfigRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.BillingRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PaymentSetupUiState(
  val configured: Boolean = false,
  val displayName: String? = null,
  val supportEmail: String? = null,
  val processRefunds: Boolean = false,
  val refundWindowDays: Int = 0,
  /** Last-4 of the Razorpay key id — enough to show which key is wired, never the full id. */
  val keyIdLast4: String? = null,
  /**
   * Freshly rotated webhook secret. The worker returns it once, so it lives here transiently and
   * is cleared by [clearWebhookSecret] — it is never persisted or echoed back on reload.
   */
  val webhookSecret: String? = null,
  val loading: Boolean = false,
  val saving: Boolean = false,
  val error: String? = null,
) {
  fun dismissError() = copy(error = null)

  fun clearWebhookSecret() = copy(webhookSecret = null)
}

class PaymentSetupViewModel(private val repository: BillingRepository) : ViewModel() {

  private val _state = MutableStateFlow(PaymentSetupUiState())
  val state: StateFlow<PaymentSetupUiState> = _state.asStateFlow()

  init {
    load()
  }

  fun load() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.razorpayConfig()) {
        is ApiResult.Success -> {
          apply(result.data)
          _state.update { it.copy(loading = false) }
        }

        is ApiResult.Failure -> _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun save(request: RazorpayConfigRequest) {
    if (_state.value.saving) return
    _state.update { it.copy(saving = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.saveRazorpayConfig(request)) {
        is ApiResult.Success -> {
          apply(result.data)
          _state.update { it.copy(saving = false) }
        }

        is ApiResult.Failure -> _state.update { it.copy(saving = false, error = result.error.message) }
      }
    }
  }

  fun rotateWebhookSecret() {
    if (_state.value.saving) return
    _state.update { it.copy(saving = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.rotateWebhookSecret()) {
        is ApiResult.Success -> _state.update {
          it.copy(saving = false, webhookSecret = result.data.webhookSecret.takeIf(String::isNotEmpty))
        }

        is ApiResult.Failure -> _state.update { it.copy(saving = false, error = result.error.message) }
      }
    }
  }

  /** The key secret never appears in the response (it is write-only server-side) — nothing secret is echoed. */
  private fun apply(config: RazorpayConfig) {
    _state.update {
      it.copy(
        configured = config.configured,
        displayName = config.displayName,
        supportEmail = config.supportEmail,
        processRefunds = config.processRefunds,
        refundWindowDays = config.refundWindowDays,
        keyIdLast4 = config.keyId?.takeLast(4),
      )
    }
  }
}
