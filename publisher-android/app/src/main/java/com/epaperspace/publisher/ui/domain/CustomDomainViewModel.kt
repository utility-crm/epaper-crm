package com.epaperspace.publisher.ui.domain

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.epaperspace.publisher.data.model.DomainInfo
import com.epaperspace.publisher.data.network.ApiResult
import com.epaperspace.publisher.data.repository.DomainRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CustomDomainUiState(
  val domain: String = "",
  val info: DomainInfo? = null,
  val loading: Boolean = false,
  val setting: Boolean = false,
  val verifying: Boolean = false,
  val error: String? = null,
  val message: String? = null,
  val removed: Boolean = false,
) {
  /** CNAME target is fixed by the platform; the worker returns it but the app model does not. */
  val cnameTarget: String = "epaper-reader.pages.dev"
  val hasDomain: Boolean get() = !(info?.domain.isNullOrBlank())
}

/**
 * Custom reader domain: set it, then re-check DNS + SSL issuance until verified. The CNAME the
 * publisher must add at their DNS provider is a fixed platform target.
 */
class CustomDomainViewModel(private val domainRepository: DomainRepository) : ViewModel() {

  private val _state = MutableStateFlow(CustomDomainUiState())
  val state: StateFlow<CustomDomainUiState> = _state.asStateFlow()

  fun load() {
    if (_state.value.loading) return
    _state.update { it.copy(loading = true, error = null) }
    viewModelScope.launch {
      when (val result = domainRepository.domain()) {
        is ApiResult.Success -> _state.update {
          it.copy(loading = false, info = result.data, domain = result.data.domain ?: it.domain)
        }

        is ApiResult.Failure ->
          _state.update { it.copy(loading = false, error = result.error.message) }
      }
    }
  }

  fun onDomainChange(value: String) =
    _state.update { it.copy(domain = value, error = null, message = null, removed = false) }

  fun setDomain() {
    if (_state.value.setting) return
    _state.update { it.copy(setting = true, error = null, message = null) }
    val hostname = _state.value.domain
    viewModelScope.launch {
      when (val result = domainRepository.setDomain(hostname)) {
        is ApiResult.Success -> _state.update {
          it.copy(
            setting = false,
            info = result.data,
            domain = result.data.domain ?: hostname,
            message = "Saved. Now add the CNAME record at your DNS provider, then verify.",
          )
        }

        is ApiResult.Failure ->
          _state.update { it.copy(setting = false, error = result.error.message) }
      }
    }
  }

  fun verify() {
    if (_state.value.verifying) return
    _state.update { it.copy(verifying = true, error = null, message = null) }
    viewModelScope.launch {
      when (val result = domainRepository.verifyDomain()) {
        is ApiResult.Success -> _state.update {
          it.copy(
            verifying = false,
            info = result.data,
            message = if (result.data.verified) {
              "Your domain is live and serving over HTTPS."
            } else {
              "CNAME record has not propagated yet. Wait a few minutes and verify again."
            },
          )
        }

        is ApiResult.Failure ->
          _state.update { it.copy(verifying = false, error = result.error.message) }
      }
    }
  }

  fun removeDomain() {
    if (_state.value.setting) return
    _state.update { it.copy(setting = true, error = null, message = null) }
    viewModelScope.launch {
      when (val result = domainRepository.removeDomain()) {
        is ApiResult.Success -> _state.update {
          it.copy(
            setting = false,
            removed = true,
            info = null,
            domain = "",
            message = "Custom domain removed; readers fall back to the epaperspace link.",
          )
        }

        is ApiResult.Failure ->
          _state.update { it.copy(setting = false, error = result.error.message) }
      }
    }
  }

  fun dismissError() = _state.update { it.copy(error = null) }
}
