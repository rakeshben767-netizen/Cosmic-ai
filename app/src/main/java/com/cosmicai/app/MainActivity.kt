package com.cosmicai.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.cosmicai.bridge.CosmicNativeBridge
import com.unity3d.mediation.LevelPlay
import com.unity3d.mediation.LevelPlayAdError
import com.unity3d.mediation.LevelPlayAdInfo
import com.unity3d.mediation.LevelPlayConfiguration
import com.unity3d.mediation.LevelPlayInitError
import com.unity3d.mediation.LevelPlayInitListener
import com.unity3d.mediation.LevelPlayInitRequest
import com.unity3d.mediation.rewarded.LevelPlayReward
import com.unity3d.mediation.rewarded.LevelPlayRewardedAd
import com.unity3d.mediation.rewarded.LevelPlayRewardedAdListener
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class MainActivity : AppCompatActivity() {

    companion object {
        private const val LEVELPLAY_APP_KEY = "29d45e7d5"
        private const val AD_UNIT_REWARDED_PRIMARY = "Rewarded_Androidd"
        private const val AD_UNIT_REWARDED_FALLBACK = "Rewarded_Android"
        private val REWARDED_AD_UNITS = listOf(
            AD_UNIT_REWARDED_PRIMARY,
            AD_UNIT_REWARDED_FALLBACK
        )
    }

    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private val rewardedAds = ConcurrentHashMap<String, LevelPlayRewardedAd>()
    private val loadingUnits = ConcurrentHashMap<String, Boolean>()
    private val unitErrors = ConcurrentHashMap<String, String>()
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile
    private var isLevelPlayInitialized = false
    @Volatile
    private var isLevelPlayInitializing = false
    @Volatile
    private var lastAdErrorReason: String = ""
    private var pendingShowCallbackId: String? = null
    private var pendingShowTimeoutRunnable: Runnable? = null
    private var activeShowCallbackId: String? = null
    private var activeRewardEarned = false

    private val requestPermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val micGranted = results[Manifest.permission.RECORD_AUDIO] == true || hasRecordAudio()
            val pending = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            if (pending != null) {
                if (micGranted) {
                    pending.grant(pending.resources)
                } else {
                    pending.deny()
                }
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/") { path ->
                val cleanPath = if (path.isEmpty() || path == "/") "index.html" else path.trimStart('/')
                try {
                    val stream = assets.open("cosmic/$cleanPath")
                    val mimeType = when {
                        cleanPath.endsWith(".html") -> "text/html"
                        cleanPath.endsWith(".js") || cleanPath.endsWith(".mjs") -> "application/javascript"
                        cleanPath.endsWith(".css") -> "text/css"
                        cleanPath.endsWith(".json") -> "application/json"
                        cleanPath.endsWith(".svg") -> "image/svg+xml"
                        cleanPath.endsWith(".png") -> "image/png"
                        cleanPath.endsWith(".jpg") || cleanPath.endsWith(".jpeg") -> "image/jpeg"
                        cleanPath.endsWith(".woff2") -> "font/woff2"
                        else -> "application/octet-stream"
                    }
                    val headers = mapOf(
                        "Access-Control-Allow-Origin" to "*",
                        "Cache-Control" to "no-cache"
                    )
                    WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, stream)
                } catch (_: Exception) {
                    null
                }
            }
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0D101B"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            addJavascriptInterface(
                CosmicNativeBridge(this@MainActivity) { _, callbackId ->
                    showUnityAd(callbackId)
                },
                "CosmicAndroidBridge"
            )
        }

        val rootContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0D101B"))
            addView(
                webView,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            )
        }
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, windowInsets ->
            val bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(rootContainer)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false
                val scheme = url.scheme?.lowercase() ?: ""
                if (scheme == "tel" || scheme == "mailto") {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    return true
                }
                if (url.host == "appassets.androidplatform.net") {
                    return false
                }
                if (scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    return true
                }
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread {
                    val needsAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (needsAudio && !hasRecordAudio()) {
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        requestPermissionsLauncher.launch(
                            arrayOf(
                                Manifest.permission.RECORD_AUDIO,
                                Manifest.permission.READ_CONTACTS,
                                Manifest.permission.CALL_PHONE
                            )
                        )
                    } else {
                        request.grant(request.resources)
                    }
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        initUnityAds()
        requestInitialPermissions()
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    private fun findReadyRewardedUnit(): String? {
        return REWARDED_AD_UNITS.firstOrNull { rewardedAds[it]?.isAdReady() == true }
    }

    private fun initUnityAds() {
        if (isLevelPlayInitialized) {
            loadRewardedAds()
            return
        }
        if (isLevelPlayInitializing) return
        isLevelPlayInitializing = true
        LevelPlay.setAdaptersDebug(false)

        val initRequest = LevelPlayInitRequest.Builder(LEVELPLAY_APP_KEY).build()
        LevelPlay.init(applicationContext, initRequest, object : LevelPlayInitListener {
            override fun onInitSuccess(configuration: LevelPlayConfiguration) {
                runOnUiThread {
                    isLevelPlayInitializing = false
                    isLevelPlayInitialized = true
                    lastAdErrorReason = ""
                    unitErrors.clear()
                    loadRewardedAds()
                }
            }

            override fun onInitFailed(error: LevelPlayInitError) {
                val reason = "LevelPlay init failed (${error.errorCode}): ${error.errorMessage}"
                runOnUiThread {
                    isLevelPlayInitializing = false
                    isLevelPlayInitialized = false
                    lastAdErrorReason = reason
                    resolvePendingShowFailure(reason)
                    mainHandler.postDelayed({
                        if (!isDestroyed && !isLevelPlayInitialized) {
                            initUnityAds()
                        }
                    }, 10000)
                }
            }
        })
    }

    private fun loadRewardedAds() {
        if (!isLevelPlayInitialized) return
        for (adUnitId in REWARDED_AD_UNITS) {
            loadAdUnit(adUnitId)
        }
    }

    private fun loadAdUnit(adUnitId: String) {
        if (!isLevelPlayInitialized) return
        val existing = rewardedAds[adUnitId]
        if (existing != null && existing.isAdReady()) return
        if (loadingUnits[adUnitId] == true) return
        loadingUnits[adUnitId] = true

        val rewardedAd = existing ?: LevelPlayRewardedAd(adUnitId).also { ad ->
            ad.setListener(object : LevelPlayRewardedAdListener {
                override fun onAdLoaded(adInfo: LevelPlayAdInfo) {
                    runOnUiThread {
                        loadingUnits[adUnitId] = false
                        unitErrors.remove(adUnitId)
                        lastAdErrorReason = ""
                        val pendingCb = pendingShowCallbackId
                        if (pendingCb != null) {
                            pendingShowCallbackId = null
                            pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                            pendingShowTimeoutRunnable = null
                            showReadyAd(adUnitId, pendingCb)
                        }
                    }
                }

                override fun onAdLoadFailed(error: LevelPlayAdError) {
                    val reason = "LevelPlay ad failed [$adUnitId] (${error.errorCode}): ${error.errorMessage}"
                    runOnUiThread {
                        loadingUnits[adUnitId] = false
                        unitErrors[adUnitId] = reason
                        val primaryReason = unitErrors[AD_UNIT_REWARDED_PRIMARY] ?: reason
                        if (findReadyRewardedUnit() == null) {
                            lastAdErrorReason = primaryReason
                        }
                        val anyBusyOrReady = REWARDED_AD_UNITS.any {
                            rewardedAds[it]?.isAdReady() == true || loadingUnits[it] == true
                        }
                        if (!anyBusyOrReady) {
                            resolvePendingShowFailure(lastAdErrorReason.ifEmpty { primaryReason })
                        }
                        mainHandler.postDelayed({
                            if (!isDestroyed && isLevelPlayInitialized) {
                                loadAdUnit(adUnitId)
                            }
                        }, 15000)
                    }
                }

                override fun onAdDisplayed(adInfo: LevelPlayAdInfo) {}

                override fun onAdRewarded(reward: LevelPlayReward, adInfo: LevelPlayAdInfo) {
                    runOnUiThread {
                        activeRewardEarned = true
                    }
                }

                override fun onAdDisplayFailed(error: LevelPlayAdError, adInfo: LevelPlayAdInfo) {
                    val reason = "LevelPlay show failed (${error.errorCode}): ${error.errorMessage}"
                    runOnUiThread {
                        lastAdErrorReason = reason
                        val cb = activeShowCallbackId
                        activeShowCallbackId = null
                        activeRewardEarned = false
                        loadAdUnit(adUnitId)
                        if (cb != null) {
                            dispatchAdResult(cb, false, adUnitId, reason)
                        }
                    }
                }

                override fun onAdClicked(adInfo: LevelPlayAdInfo) {}

                override fun onAdClosed(adInfo: LevelPlayAdInfo) {
                    runOnUiThread {
                        val cb = activeShowCallbackId
                        if (cb == null) {
                            loadAdUnit(adUnitId)
                            return@runOnUiThread
                        }
                        if (activeRewardEarned) {
                            activeShowCallbackId = null
                            activeRewardEarned = false
                            loadAdUnit(adUnitId)
                            dispatchAdResult(cb, true, adUnitId, "")
                        } else {
                            mainHandler.postDelayed({
                                if (activeShowCallbackId == cb) {
                                    val earned = activeRewardEarned
                                    activeShowCallbackId = null
                                    activeRewardEarned = false
                                    loadAdUnit(adUnitId)
                                    val reason = if (earned) "" else "Rewarded ad was closed before earning reward."
                                    dispatchAdResult(cb, earned, adUnitId, reason)
                                }
                            }, 250)
                        }
                    }
                }

                override fun onAdInfoChanged(adInfo: LevelPlayAdInfo) {}
            })
            rewardedAds[adUnitId] = ad
        }

        rewardedAd.loadAd()
    }

    private fun resolvePendingShowFailure(reason: String) {
        val pendingCb = pendingShowCallbackId ?: return
        pendingShowCallbackId = null
        pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingShowTimeoutRunnable = null
        dispatchAdResult(pendingCb, false, AD_UNIT_REWARDED_PRIMARY, reason)
    }

    private fun dispatchAdResult(
        callbackId: String,
        completed: Boolean,
        placementId: String,
        reason: String = ""
    ) {
        val safeCallback = callbackId.replace(Regex("[^a-zA-Z0-9_-]"), "")
        val safePlacement = placementId.replace(Regex("[^a-zA-Z0-9_-]"), "")
        val quotedReason = JSONObject.quote(reason)
        runOnUiThread {
            if (::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.__cosmicOnUnityAdResult && window.__cosmicOnUnityAdResult('$safeCallback', $completed, '$safePlacement', $quotedReason);",
                    null
                )
            }
        }
    }

    private fun showUnityAd(callbackId: String) {
        runOnUiThread {
            val readyUnit = findReadyRewardedUnit()
            if (readyUnit != null) {
                pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                pendingShowTimeoutRunnable = null
                pendingShowCallbackId = null
                showReadyAd(readyUnit, callbackId)
                return@runOnUiThread
            }

            pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            val previousCb = pendingShowCallbackId
            if (previousCb != null && previousCb != callbackId) {
                dispatchAdResult(previousCb, false, AD_UNIT_REWARDED_PRIMARY, "Superseded by newer ad request.")
            }

            pendingShowCallbackId = callbackId
            val timeoutRunnable = Runnable {
                if (pendingShowCallbackId == callbackId) {
                    pendingShowCallbackId = null
                    pendingShowTimeoutRunnable = null
                    val reason = if (lastAdErrorReason.isNotEmpty()) {
                        lastAdErrorReason
                    } else {
                        "Rewarded ad is still loading. Try again in a few seconds."
                    }
                    dispatchAdResult(callbackId, false, AD_UNIT_REWARDED_PRIMARY, reason)
                }
            }
            pendingShowTimeoutRunnable = timeoutRunnable
            mainHandler.postDelayed(timeoutRunnable, 10000)

            if (!isLevelPlayInitialized) {
                initUnityAds()
            } else {
                loadRewardedAds()
            }
        }
    }

    private fun showReadyAd(adUnitId: String, callbackId: String) {
        val ad = rewardedAds[adUnitId]
        if (ad == null || !ad.isAdReady()) {
            loadAdUnit(adUnitId)
            dispatchAdResult(callbackId, false, adUnitId, "Rewarded ad not ready.")
            return
        }
        activeShowCallbackId = callbackId
        activeRewardEarned = false
        ad.showAd(this@MainActivity)
    }

    private fun hasRecordAudio(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestInitialPermissions() {
        val needed = mutableListOf<String>()
        if (!hasRecordAudio()) {
            needed.add(Manifest.permission.RECORD_AUDIO)
        }
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.READ_CONTACTS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.READ_CONTACTS)
        }
        if (needed.isNotEmpty()) {
            requestPermissionsLauncher.launch(needed.toTypedArray())
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        webView.destroy()
        super.onDestroy()
    }
}
