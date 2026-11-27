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
    val grantPowerOn: Boolean,
    val grantBadmashMode: Boolean = false,
    val nextIntervalSec: Int = 240,
    val outcome: String
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("ad_type", adType)
            put("trigger", trigger)
            put("grant_power_on", grantPowerOn)
            put("grant_badmash_mode", grantBadmashMode)
            put("next_interval_sec", nextIntervalSec)
            put("outcome", outcome)
        }
    }
}

object UnityAdsManager {
    private const val RETRY_DELAY_MS = 5_000L
    private const val POWER_ON_WAIT_TIMEOUT_MS = 6_000L
    private const val APP_LOAD_WAIT_TIMEOUT_MS = 12_000L
    private const val INTERVAL_SEC = 240

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

    private var initRetryJob: Job? = null
    private var rewardedRetryJob: Job? = null
    private var interstitialRetryJob: Job? = null
    private var pendingTimeoutJob: Job? = null

    private var activeShowTrigger: String? = null
    private var pendingTrigger: String? = null
    private var lastRuleEvent: AdRuleEvent? = null

    private val initListener = object : IUnityAdsInitializationListener {
        override fun onInitializationComplete() {
            scope.launch {
                initRetryJob?.cancel()
                initRetryJob = null
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
                resolvePendingTriggerOnError("${error.name}: $message")
                scheduleRetryInitialize()
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
                resolvePendingTriggerOnError("${error.name}: $message")
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
                val trigger = activeShowTrigger ?: "interval_4m"
                activeShowTrigger = null
                _rewardedState.value = AdPlacementState(
                    placementId = placementId,
                    phase = PlacementLoadPhase.FAILED,
                    rawErrorCode = error.name,
                    rawErrorMessage = message
                )
                if (trigger == "power_on") {
                    _userMessages.tryEmit("Please try again.")
                }
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = trigger,
                        grantPowerOn = false,
                        grantBadmashMode = false,
                        nextIntervalSec = INTERVAL_SEC,
                        outcome = "show_failed"
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
                val trigger = activeShowTrigger ?: "interval_4m"
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
                                grantPowerOn = trigger == "power_on",
                                grantBadmashMode = false,
                                nextIntervalSec = INTERVAL_SEC,
                                outcome = "completed"
                            )
                        )
                    }

                    UnityAds.UnityAdsShowCompletionState.SKIPPED -> {
                        _counters.update { it.copy(skips = it.skips + 1) }
                        if (trigger == "power_on") {
                            _userMessages.tryEmit("Please try again.")
                        }
                        emitRuleEvent(
                            AdRuleEvent(
                                trigger = trigger,
                                grantPowerOn = false,
                                grantBadmashMode = false,
                                nextIntervalSec = INTERVAL_SEC,
                                outcome = "skipped"
                            )
                        )
                    }

                    else -> {
                        emitRuleEvent(
                            AdRuleEvent(
                                trigger = trigger,
                                grantPowerOn = false,
                                grantBadmashMode = false,
                                nextIntervalSec = INTERVAL_SEC,
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
            initRetryJob?.cancel()
            initRetryJob = null
            _sdkStatus.value = SdkStatusState(phase = SdkInitPhase.INITIALIZED)
            val rewPhase = _rewardedState.value.phase
            if (rewPhase == PlacementLoadPhase.IDLE || rewPhase == PlacementLoadPhase.FAILED) {
                loadRewarded()
            }
            return
        }

        if (_sdkStatus.value.phase == SdkInitPhase.INITIALIZING) {
            return
        }

        initRetryJob?.cancel()
        initRetryJob = null
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
                "app_load", "power_on", "interval_4m" -> trigger
                else -> "interval_4m"
            }

            if (activeShowTrigger != null) {
                return@launch
            }

            val activity = currentActivityRef?.get()?.takeIf { !it.isFinishing && !it.isDestroyed }
            if (activity == null) {
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = normalizedTrigger,
                        grantPowerOn = false,
                        grantBadmashMode = false,
                        nextIntervalSec = INTERVAL_SEC,
                        outcome = "ad_not_loaded"
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

            if (normalizedTrigger == "power_on") {
                pendingTrigger = "power_on"
                if (sdkPhase == SdkInitPhase.UNINITIALIZED || sdkPhase == SdkInitPhase.FAILED) {
                    appContext?.let { initialize(it) }
                } else if (rewardedPhase == PlacementLoadPhase.IDLE || rewardedPhase == PlacementLoadPhase.FAILED) {
                    loadRewarded()
                }
                schedulePendingTimeout("power_on", POWER_ON_WAIT_TIMEOUT_MS)
                return@launch
            }

            if (normalizedTrigger == "app_load") {
                pendingTrigger = "app_load"
                if (sdkPhase == SdkInitPhase.UNINITIALIZED || sdkPhase == SdkInitPhase.FAILED) {
                    appContext?.let { initialize(it) }
                } else if (rewardedPhase == PlacementLoadPhase.IDLE || rewardedPhase == PlacementLoadPhase.FAILED) {
                    loadRewarded()
                }
                schedulePendingTimeout("app_load", APP_LOAD_WAIT_TIMEOUT_MS)
                return@launch
            }

            // For interval_4m when not yet loaded: trigger initialize/load and reset 4m timer cleanly
            if (sdkPhase == SdkInitPhase.UNINITIALIZED || sdkPhase == SdkInitPhase.FAILED) {
                appContext?.let { initialize(it) }
            } else if (rewardedPhase == PlacementLoadPhase.IDLE || rewardedPhase == PlacementLoadPhase.FAILED) {
                loadRewarded()
            }
            emitRuleEvent(
                AdRuleEvent(
                    trigger = normalizedTrigger,
                    grantPowerOn = false,
                    grantBadmashMode = false,
                    nextIntervalSec = INTERVAL_SEC,
                    outcome = "not_ready"
                )
            )
        }
    }

    private fun showLoadedRewarded(activity: Activity, trigger: String) {
        pendingTrigger = null
        pendingTimeoutJob?.cancel()
        pendingTimeoutJob = null
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
            resolvePendingTriggerOnError("Activity unavailable")
            return
        }
        showLoadedRewarded(activity, pending)
    }

    private fun resolvePendingTriggerOnError(rawReason: String? = null) {
        val pending = pendingTrigger ?: return
        if (pending == "app_load") {
            // Keep waiting during startup window while 5s retry runs unless timeout expires
            return
        }
        pendingTrigger = null
        pendingTimeoutJob?.cancel()
        pendingTimeoutJob = null
        if (pending == "power_on") {
            _userMessages.tryEmit("Please try again.")
        }
        emitRuleEvent(
            AdRuleEvent(
                trigger = pending,
                grantPowerOn = false,
                grantBadmashMode = false,
                nextIntervalSec = INTERVAL_SEC,
                outcome = "ad_not_loaded"
            )
        )
    }

    private fun schedulePendingTimeout(expectedTrigger: String, timeoutMs: Long) {
        pendingTimeoutJob?.cancel()
        pendingTimeoutJob = scope.launch {
            delay(timeoutMs)
            if (pendingTrigger == expectedTrigger && activeShowTrigger == null) {
                pendingTrigger = null
                if (expectedTrigger == "power_on") {
                    _userMessages.tryEmit("Please try again.")
                }
                emitRuleEvent(
                    AdRuleEvent(
                        trigger = expectedTrigger,
                        grantPowerOn = false,
                        grantBadmashMode = false,
                        nextIntervalSec = INTERVAL_SEC,
                        outcome = if (expectedTrigger == "power_on") "ad_not_loaded" else "not_ready"
                    )
                )
            }
        }
    }

    private fun scheduleRetryInitialize() {
        if (initRetryJob?.isActive == true) return
        initRetryJob = scope.launch {
            delay(RETRY_DELAY_MS)
            initRetryJob = null
            appContext?.let { initialize(it) }
        }
    }

    private fun scheduleRetryLoad(placementId: String) {
        if (placementId == Constants.REWARDED_PLACEMENT_ID) {
            if (rewardedRetryJob?.isActive == true) return
            rewardedRetryJob = scope.launch {
                delay(RETRY_DELAY_MS)
                rewardedRetryJob = null
                loadPlacement(placementId)
            }
        } else if (placementId == Constants.INTERSTITIAL_PLACEMENT_ID) {
            if (interstitialRetryJob?.isActive == true) return
            interstitialRetryJob = scope.launch {
                delay(RETRY_DELAY_MS)
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
