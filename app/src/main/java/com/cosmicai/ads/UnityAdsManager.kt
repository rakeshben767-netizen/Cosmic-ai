package com.cosmicai.ads

import android.app.Activity
import android.content.Context
import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.IUnityAdsLoadListener
import com.unity3d.ads.IUnityAdsShowListener
import com.unity3d.ads.UnityAds
import com.unity3d.ads.UnityAdsShowOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.lang.ref.WeakReference

enum class SdkInitPhase {
    UNINITIALIZED,
    INITIALIZING,
    INITIALIZED,
    FAILED
}

enum class PlacementLoadPhase {
    IDLE,
    LOADING,
    LOADED,
    SHOWING,
    FAILED
}

data class SdkStatusState(
    val phase: SdkInitPhase = SdkInitPhase.UNINITIALIZED,
    val rawErrorCode: String? = null,
    val rawErrorMessage: String? = null
)

data class AdPlacementState(
    val placementId: String,
    val phase: PlacementLoadPhase = PlacementLoadPhase.IDLE,
    val rawErrorCode: String? = null,
    val rawErrorMessage: String? = null
)

data class AdCounters(
    val loadSuccess: Int = 0,
    val loadFailed: Int = 0,
    val impressions: Int = 0,
    val clicks: Int = 0,
    val skips: Int = 0
)

data class AdRuleEvent(
    val adType: String = "rewarded",
    val trigger: String,
    val grantBadmashMode: Boolean,
    val nextIntervalSec: Int = 300,
    val outcome: String
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("ad_type", adType)
            put("trigger", trigger)
            put("grant_badmash_mode", grantBadmashMode)
            put("next_interval_sec", nextIntervalSec)
            put("outcome", outcome)
        }
    }
}

object UnityAdsManager {
    private const val RETRY_LOAD_DELAY_MS = 5_000L
    private const val MODE_SWITCH_WAIT_TIMEOUT_MS = 3_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _sdkStatus = MutableStateFlow(SdkStatusState())
    val sdkStatus: StateFlow<SdkStatusState> = _sdkStatus.asStateFlow()

    private val _rewardedState = MutableStateFlow(
        AdPlacementState(placementId = Constants.REWARDED_PLACEMENT_ID)
    )
    val rewardedState: StateFlow<AdPlacementState> = _rewardedState.asStateFlow()

    private val _interstitialState = MutableStateFlow(
        AdPlacementState(placementId = Constants.INTERSTITIAL_PLACEMENT_ID)
    )
    val interstitialState: StateFlow<AdPlacementState> = _interstitialState.asStateFlow()

    private val _counters = MutableStateFlow(AdCounters())
    val counters: StateFlow<AdCounters> = _counters.asStateFlow()

    private val _userMessages = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val userMessages: SharedFlow<String> = _userMessages.asSharedFlow()

    private val _ruleEvents = MutableSharedFlow<AdRuleEvent>(extraBufferCapacity = 16)
    val ruleEvents: SharedFlow<AdRuleEvent> = _ruleEvents.asSharedFlow()

    private var appContext: Context? = null
    private var currentActivityRef: WeakReference<Activity>? = null

    private var rewardedRetryJob: Job? = null
    private var interstitialRetryJob: Job? = null
    private var modeSwitchTimeoutJob: Job? = null

    private var activeShowTrigger: String? = null
    private var pendingTrigger: String? = null
    private var lastRuleEvent: AdRuleEvent? = null

    private val initListener = object : IUnityAdsInitializationListener {
        override fun onInitializationComplete() {
            scope.launch {
                _sdkStatus.value = SdkStatusState(
                    phase = SdkInitPhase.INITIALIZED,
                    rawErrorCode = null,
                    rawErrorMessage = null
                )
                loadRewarded()
            }
        }

        override fun onInitializationFailed(
            error: UnityAds.UnityAdsInitializationError,
            message: String
        ) {
            scope.launch {
                _sdkStatus.value = SdkStatusState(
                    phase = SdkInitPhase.FAILED,
                    rawErrorCode = error.name,
                    rawErrorMessage = message
                )
                resolvePendingTriggerOnError()
            }
        }
    }

    private val rewardedLoadListener = object : IUnityAdsLoadListener {
        override fun onUnityAdsAdLoaded(placementId: String) {
            scope.launch {
                rewardedRetryJob?.cancel()
                rewardedRetryJob = null
                _counters.update { it.copy(loadSuccess = it.loadSuccess + 1) }
                _rewardedState.value = AdPlacementState(
                    placementId = placementId,
                    phase = PlacementLoadPhase.LOADED,
                    rawErrorCode = null,
                    rawErrorMessage = null
                )
                maybeConsumePendingTriggerOnLoaded()
            }
        }

        override fun onUnityAdsFailedToLoad(
            placementId: String,
            error: UnityAds.UnityAdsLoadError,
            message: String
        ) {
            scope.launch {
                _counters.update { it.copy(loadFailed = it.loadFailed + 1) }
                _rewardedState.value = AdPlacementState(
                    placementId = placementId,
                    phase = PlacementLoadPhase.FAILED,
                    rawErrorCode = error.name,
                    rawErrorMessage = message
                )
                resolvePendingTriggerOnError()
                scheduleRetryLoad(placementId)
            }
        }
    }

    private val interstitialLoadListener = object : IUnityAdsLoadListener {
        override fun onUnityAdsAdLoaded(placementId: String) {
            scope.launch {
                interstitialRetryJob?.cancel()
                interstitialRetryJob = null
                _counters.update { it.copy(loadSuccess = it.loadSuccess + 1) }
                _interstitialState.value = AdPlacementState(
                    placementId = placementId,
                    phase = PlacementLoadPhase.LOADED,
                    rawErrorCode = null,
                    rawErrorMessage = null
                )
            }
        }

        override fun onUnityAdsFailedToLoad(
            placementId: String,
            error: UnityAds.UnityAdsLoadError,
            message: String
        ) {
            scope.launch {
                _counters.update { it.copy(loadFailed = it.loadFailed + 1) }
                _interstitialState.value = AdPlacementState(
                    placementId = placementId,
                    phase = PlacementLoadPhase.FAILED,
                    rawErrorCode = error.name,
                    rawErrorMessage = message
                )
                scheduleRetryLoad(placementId)
            }
        }
    }

    private val rewardedShowListener = object : IUnityAdsShowListener {
        override fun onUnityAdsShowFailure(
            placementId: String,
            error: UnityAds.UnityAdsShowError,
            message: String
        ) {
            scope.launch {
                val trigger = activeShowTrigger ?: "interval_5m"
                activeShowTrigger = null
                _rewardedState.value = AdPlacementState(
                    placementId = placementId,
                    phase = PlacementLoadPhase.FAILED,
                    rawErrorCode = error.name,
                    rawErrorMessage = message
                )
                val grantBadmash = trigger == "mode_switch_badmash"
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = trigger,
                        grantBadmashMode = grantBadmash,
                        outcome = "fallback_no_fill_or_error"
                    )
                )
                loadRewarded()
            }
        }

        override fun onUnityAdsShowStart(placementId: String) {
            scope.launch {
                _counters.update { it.copy(impressions = it.impressions + 1) }
                _rewardedState.update { it.copy(phase = PlacementLoadPhase.SHOWING) }
            }
        }

        override fun onUnityAdsShowClick(placementId: String) {
            scope.launch {
                _counters.update { it.copy(clicks = it.clicks + 1) }
            }
        }

        override fun onUnityAdsShowComplete(
            placementId: String,
            state: UnityAds.UnityAdsShowCompletionState
        ) {
            scope.launch {
                val trigger = activeShowTrigger ?: "interval_5m"
                activeShowTrigger = null
                _rewardedState.update {
                    it.copy(
                        phase = PlacementLoadPhase.IDLE,
                        rawErrorCode = null,
                        rawErrorMessage = null
                    )
                }

                when (state) {
                    UnityAds.UnityAdsShowCompletionState.COMPLETED -> {
                        _userMessages.tryEmit("Congratulations! Reward earned.")
                        emitRuleEvent(
                            AdRuleEvent(
                                trigger = trigger,
                                grantBadmashMode = trigger == "mode_switch_badmash",
                                outcome = "completed"
                            )
                        )
                    }

                    UnityAds.UnityAdsShowCompletionState.SKIPPED -> {
                        _counters.update { it.copy(skips = it.skips + 1) }
                        emitRuleEvent(
                            AdRuleEvent(
                                trigger = trigger,
                                grantBadmashMode = false,
                                outcome = "skipped"
                            )
                        )
                    }

                    else -> {
                        emitRuleEvent(
                            AdRuleEvent(
                                trigger = trigger,
                                grantBadmashMode = false,
                                outcome = "skipped"
                            )
                        )
                    }
                }

                loadRewarded()
            }
        }
    }

    fun attachActivity(activity: Activity) {
        currentActivityRef = WeakReference(activity)
    }

    fun detachActivity(activity: Activity) {
        if (currentActivityRef?.get() === activity) {
            currentActivityRef = null
        }
    }

    fun initialize(context: Context) {
        val appCtx = context.applicationContext
        appContext = appCtx

        if (UnityAds.isInitialized) {
            _sdkStatus.value = SdkStatusState(phase = SdkInitPhase.INITIALIZED)
            if (_rewardedState.value.phase == PlacementLoadPhase.IDLE) {
                loadRewarded()
            }
            return
        }

        if (_sdkStatus.value.phase == SdkInitPhase.INITIALIZING) {
            return
        }

        _sdkStatus.value = SdkStatusState(phase = SdkInitPhase.INITIALIZING)
        UnityAds.initialize(
            appCtx,
            Constants.UNITY_GAME_ID,
            Constants.TEST_MODE,
            initListener
        )
    }

    fun loadRewarded() {
        loadPlacement(Constants.REWARDED_PLACEMENT_ID)
    }

    fun loadPlacement(placementId: String) {
        if (!UnityAds.isInitialized) {
            appContext?.let { initialize(it) }
            return
        }

        if (placementId == Constants.REWARDED_PLACEMENT_ID) {
            val currentPhase = _rewardedState.value.phase
            if (currentPhase == PlacementLoadPhase.LOADING || currentPhase == PlacementLoadPhase.SHOWING) {
                return
            }
            rewardedRetryJob?.cancel()
            rewardedRetryJob = null
            _rewardedState.update {
                it.copy(
                    phase = PlacementLoadPhase.LOADING,
                    rawErrorCode = null,
                    rawErrorMessage = null
                )
            }
            UnityAds.load(placementId, rewardedLoadListener)
        } else if (placementId == Constants.INTERSTITIAL_PLACEMENT_ID) {
            val currentPhase = _interstitialState.value.phase
            if (currentPhase == PlacementLoadPhase.LOADING || currentPhase == PlacementLoadPhase.SHOWING) {
                return
            }
            interstitialRetryJob?.cancel()
            interstitialRetryJob = null
            _interstitialState.update {
                it.copy(
                    phase = PlacementLoadPhase.LOADING,
                    rawErrorCode = null,
                    rawErrorMessage = null
                )
            }
            UnityAds.load(placementId, interstitialLoadListener)
        }
    }

    fun requestOrShowRewarded(trigger: String) {
        scope.launch {
            val normalizedTrigger = when (trigger) {
                "app_load", "interval_5m", "mode_switch_badmash" -> trigger
                else -> "interval_5m"
            }

            if (activeShowTrigger != null) {
                return@launch
            }

            val activity = currentActivityRef?.get()?.takeIf { !it.isFinishing && !it.isDestroyed }
            if (activity == null) {
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = normalizedTrigger,
                        grantBadmashMode = normalizedTrigger == "mode_switch_badmash",
                        outcome = "fallback_no_fill_or_error"
                    )
                )
                return@launch
            }

            val sdkPhase = _sdkStatus.value.phase
            val rewardedPhase = _rewardedState.value.phase

            if (sdkPhase == SdkInitPhase.INITIALIZED && rewardedPhase == PlacementLoadPhase.LOADED) {
                showLoadedRewarded(activity, normalizedTrigger)
                return@launch
            }

            if (sdkPhase == SdkInitPhase.FAILED || rewardedPhase == PlacementLoadPhase.FAILED) {
                if (rewardedPhase == PlacementLoadPhase.FAILED) {
                    loadRewarded()
                } else {
                    appContext?.let { initialize(it) }
                }
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = normalizedTrigger,
                        grantBadmashMode = normalizedTrigger == "mode_switch_badmash",
                        outcome = "fallback_no_fill_or_error"
                    )
                )
                return@launch
            }

            // SDK is still initializing or initial Rewarded Ad is loading
            if (normalizedTrigger == "app_load" || normalizedTrigger == "mode_switch_badmash") {
                pendingTrigger = normalizedTrigger
                if (sdkPhase == SdkInitPhase.UNINITIALIZED) {
                    appContext?.let { initialize(it) }
                } else if (sdkPhase == SdkInitPhase.INITIALIZED && rewardedPhase == PlacementLoadPhase.IDLE) {
                    loadRewarded()
                }
                if (normalizedTrigger == "mode_switch_badmash") {
                    scheduleModeSwitchFallbackTimeout()
                }
                return@launch
            }

            // For interval_5m when not yet loaded: trigger load and reset 5m timer cleanly
            if (rewardedPhase == PlacementLoadPhase.IDLE) {
                loadRewarded()
            }
            emitRuleEvent(
                AdRuleEvent(
                    trigger = normalizedTrigger,
                    grantBadmashMode = false,
                    outcome = "not_ready"
                )
            )
        }
    }

    private fun showLoadedRewarded(activity: Activity, trigger: String) {
        pendingTrigger = null
        modeSwitchTimeoutJob?.cancel()
        modeSwitchTimeoutJob = null
        activeShowTrigger = trigger
        _rewardedState.update { it.copy(phase = PlacementLoadPhase.SHOWING) }
        UnityAds.show(
            activity,
            Constants.REWARDED_PLACEMENT_ID,
            UnityAdsShowOptions(),
            rewardedShowListener
        )
    }

    private fun maybeConsumePendingTriggerOnLoaded() {
        val pending = pendingTrigger ?: return
        val activity = currentActivityRef?.get()?.takeIf { !it.isFinishing && !it.isDestroyed }
        if (activity == null) {
            resolvePendingTriggerOnError()
            return
        }
        showLoadedRewarded(activity, pending)
    }

    private fun resolvePendingTriggerOnError() {
        val pending = pendingTrigger ?: return
        pendingTrigger = null
        modeSwitchTimeoutJob?.cancel()
        modeSwitchTimeoutJob = null
        emitRuleEvent(
            AdRuleEvent(
                trigger = pending,
                grantBadmashMode = pending == "mode_switch_badmash",
                outcome = "fallback_no_fill_or_error"
            )
        )
    }

    private fun scheduleModeSwitchFallbackTimeout() {
        modeSwitchTimeoutJob?.cancel()
        modeSwitchTimeoutJob = scope.launch {
            delay(MODE_SWITCH_WAIT_TIMEOUT_MS)
            if (pendingTrigger == "mode_switch_badmash" && activeShowTrigger == null) {
                pendingTrigger = null
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = "mode_switch_badmash",
                        grantBadmashMode = true,
                        outcome = "fallback_no_fill_or_error"
                    )
                )
            }
        }
    }

    private fun scheduleRetryLoad(placementId: String) {
        if (placementId == Constants.REWARDED_PLACEMENT_ID) {
            if (rewardedRetryJob?.isActive == true) return
            rewardedRetryJob = scope.launch {
                delay(RETRY_LOAD_DELAY_MS)
                rewardedRetryJob = null
                loadPlacement(placementId)
            }
        } else if (placementId == Constants.INTERSTITIAL_PLACEMENT_ID) {
            if (interstitialRetryJob?.isActive == true) return
            interstitialRetryJob = scope.launch {
                delay(RETRY_LOAD_DELAY_MS)
                interstitialRetryJob = null
                loadPlacement(placementId)
            }
        }
    }

    private fun emitRuleEvent(event: AdRuleEvent) {
        lastRuleEvent = event
        _ruleEvents.tryEmit(event)
    }

    fun getSnapshotJson(): JSONObject {
        val sdk = _sdkStatus.value
        val rew = _rewardedState.value
        val inter = _interstitialState.value
        val cnt = _counters.value
        return JSONObject().apply {
            put("appName", Constants.APP_NAME)
            put("unityGameId", Constants.UNITY_GAME_ID)
            put("testMode", Constants.TEST_MODE)
            put("sdkStatus", JSONObject().apply {
                put("phase", sdk.phase.name)
                put("rawErrorCode", sdk.rawErrorCode ?: JSONObject.NULL)
                put("rawErrorMessage", sdk.rawErrorMessage ?: JSONObject.NULL)
            })
            put("rewardedState", JSONObject().apply {
                put("placementId", rew.placementId)
                put("phase", rew.phase.name)
                put("rawErrorCode", rew.rawErrorCode ?: JSONObject.NULL)
                put("rawErrorMessage", rew.rawErrorMessage ?: JSONObject.NULL)
            })
            put("interstitialState", JSONObject().apply {
                put("placementId", inter.placementId)
                put("phase", inter.phase.name)
                put("rawErrorCode", inter.rawErrorCode ?: JSONObject.NULL)
                put("rawErrorMessage", inter.rawErrorMessage ?: JSONObject.NULL)
            })
            put("counters", JSONObject().apply {
                put("loadSuccess", cnt.loadSuccess)
                put("loadFailed", cnt.loadFailed)
                put("impressions", cnt.impressions)
                put("clicks", cnt.clicks)
                put("skips", cnt.skips)
            })
            put("lastRuleEvent", lastRuleEvent?.toJson() ?: JSONObject.NULL)
        }
    }
}
