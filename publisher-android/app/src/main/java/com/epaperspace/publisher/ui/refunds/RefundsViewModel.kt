package com.epaperspace.publisher.ui.refunds

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.ProcessRefundRequest
import com.epaperspace.publisher.data.model.RefundRequest
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.BillingRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RefundsUiState(
  val requests: List<RefundRequest> = emptyList(),
  val loading: Boolean = false,
  /** Id of the request currently being processed; blocks double-submits. */
  val processingId: String? = null,
  val error: String? = null,
) {
  fun dismissError() = copy(error = null)
}

class RefundsViewModel(private val repository: BillingRepository) : ViewModel() {

  private val _state = MutableStateFlow(RefundsUiState())
  val state: StateFlow<RefundsUiState> = _state.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = repository.refundRequests()) {
        is ApiResult.Success -> _state.update { it.copy(loading = false, requests = result.data.items) }
        is ApiResult.Failure -> _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  /** `amountPaise` stays an integral Long all the way through — never float math on money. */
  fun process(id: String, action: String, amountPaise: Long? = null, message: String? = null) {
    if (_state.value.processingId != null) return
    _state.update { it.copy(processingId = id, error = null) }
    viewModelScope.launch {
      when (val result = repository.processRefundRequest(id, ProcessRefundRequest(action, amountPaise, message))) {
        is ApiResult.Success -> _state.update {
          it.copy(
            processingId = null,
            requests = it.requests.map { request -> if (request.id == id) result.data else request },
          )
        }

        is ApiResult.Failure -> _state.update { it.copy(processingId = null, error = result.error.message) }
      }
    }
  }
}
