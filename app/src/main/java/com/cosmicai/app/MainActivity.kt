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
import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.IUnityAdsLoadListener
import com.unity3d.ads.IUnityAdsShowListener
import com.unity3d.ads.UnityAds
import com.unity3d.ads.UnityAdsShowOptions
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class MainActivity : AppCompatActivity() {

    companion object {
        private const val UNITY_GAME_ID = "800426177"
        private const val UNITY_TEST_MODE = false
        private const val PRIMARY_REWARDED_PLACEMENT = "Rewarded_Android"
        private val REWARDED_PLACEMENT_CANDIDATES = listOf(
            "Rewarded_Android",
            "rewardedVideo",
            "Rewarded_Video",
            "Rewarded",
            "Watch_rewards_Android"
        )
    }

    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private val disabledPlacements = ConcurrentHashMap<String, Boolean>()
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile
    private var isUnityInitializing = false
    @Volatile
    private var confirmedPlacement: String? = null
    @Volatile
    private var readyPlacement: String? = null
    @Volatile
    private var activeLoadingPlacement: String? = null
    @Volatile
    private var lastAdErrorReason: String = ""
    private var pendingShowCallbackId: String? = null
    private var pendingShowTimeoutRunnable: Runnable? = null

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

    private fun nextPlacementToLoad(): String? {
        confirmedPlacement?.let { return it }
        return REWARDED_PLACEMENT_CANDIDATES.firstOrNull { disabledPlacements[it] != true }
    }

    private fun initUnityAds() {
        if (UnityAds.isInitialized()) {
            loadRewardedAds()
            return
        }
        if (isUnityInitializing) return
        isUnityInitializing = true

        UnityAds.initialize(
            applicationContext,
            UNITY_GAME_ID,
            UNITY_TEST_MODE,
            object : IUnityAdsInitializationListener {
                override fun onInitializationComplete() {
                    runOnUiThread {
                        isUnityInitializing = false
                        lastAdErrorReason = ""
                        loadRewardedAds()
                    }
                }

                override fun onInitializationFailed(
                    error: UnityAds.UnityAdsInitializationError?,
                    message: String?
                ) {
                    val reason = "Unity Ads init failed (${error ?: "UNKNOWN"}): ${message ?: "Unknown error"}"
                    runOnUiThread {
                        isUnityInitializing = false
                        lastAdErrorReason = reason
                        resolvePendingShowFailure(reason)
                        mainHandler.postDelayed({
                            if (!isDestroyed && !UnityAds.isInitialized()) {
                                initUnityAds()
                            }
                        }, 10000)
                    }
                }
            }
        )
    }

    private fun loadRewardedAds() {
        if (!UnityAds.isInitialized()) return
        if (readyPlacement != null || activeLoadingPlacement != null) return
        val targetPlacement = nextPlacementToLoad()
        if (targetPlacement == null) {
            val reason =
                "No rewarded placement configured on Game ID $UNITY_GAME_ID. Enable Rewarded_Android in Unity Dashboard > Monetization > Placements."
            lastAdErrorReason = reason
            resolvePendingShowFailure(reason)
            mainHandler.postDelayed({
                if (!isDestroyed && UnityAds.isInitialized() && readyPlacement == null && confirmedPlacement == null) {
                    disabledPlacements.clear()
                    loadRewardedAds()
                }
            }, 20000)
            return
        }
        loadPlacement(targetPlacement)
    }

    private fun loadPlacement(placementId: String) {
        if (!UnityAds.isInitialized()) return
        if (readyPlacement != null || activeLoadingPlacement != null) return
        activeLoadingPlacement = placementId

        UnityAds.load(placementId, object : IUnityAdsLoadListener {
            override fun onUnityAdsAdLoaded(loadedId: String?) {
                val resolvedId = loadedId ?: placementId
                runOnUiThread {
                    activeLoadingPlacement = null
                    confirmedPlacement = resolvedId
                    readyPlacement = resolvedId
                    lastAdErrorReason = ""
                    val pendingCb = pendingShowCallbackId
                    if (pendingCb != null) {
                        pendingShowCallbackId = null
                        pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                        pendingShowTimeoutRunnable = null
                        showReadyPlacement(resolvedId, pendingCb)
                    }
                }
            }

            override fun onUnityAdsFailedToLoad(
                failedId: String?,
                error: UnityAds.UnityAdsLoadError?,
                message: String?
            ) {
                val resolvedId = failedId ?: placementId
                val msg = message ?: "Load failed"
                val reason = "Unity ad failed [$resolvedId] (${error ?: "UNKNOWN"}): $msg"
                val isMissingPlacement =
                    error == UnityAds.UnityAdsLoadError.INVALID_ARGUMENT &&
                        msg.contains("No placement configured", ignoreCase = true)

                runOnUiThread {
                    activeLoadingPlacement = null
                    if (isMissingPlacement && confirmedPlacement == null) {
                        disabledPlacements[resolvedId] = true
                        if (nextPlacementToLoad() != null) {
                            loadRewardedAds()
                            return@runOnUiThread
                        }
                    } else {
                        confirmedPlacement = resolvedId
                    }

                    lastAdErrorReason = reason
                    resolvePendingShowFailure(reason)
                    mainHandler.postDelayed({
                        if (!isDestroyed && UnityAds.isInitialized() && readyPlacement == null) {
                            loadRewardedAds()
                        }
                    }, 12000)
                }
            }
        })
    }

    private fun resolvePendingShowFailure(reason: String) {
        val pendingCb = pendingShowCallbackId ?: return
        pendingShowCallbackId = null
        pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingShowTimeoutRunnable = null
        dispatchAdResult(pendingCb, false, confirmedPlacement ?: PRIMARY_REWARDED_PLACEMENT, reason)
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
            val ready = readyPlacement
            if (ready != null) {
                pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                pendingShowTimeoutRunnable = null
                pendingShowCallbackId = null
                showReadyPlacement(ready, callbackId)
                return@runOnUiThread
            }

            pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            val previousCb = pendingShowCallbackId
            if (previousCb != null && previousCb != callbackId) {
                dispatchAdResult(
                    previousCb,
                    false,
                    confirmedPlacement ?: PRIMARY_REWARDED_PLACEMENT,
                    "Superseded by newer ad request."
                )
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
                    dispatchAdResult(callbackId, false, confirmedPlacement ?: PRIMARY_REWARDED_PLACEMENT, reason)
                }
            }
            pendingShowTimeoutRunnable = timeoutRunnable
            mainHandler.postDelayed(timeoutRunnable, 10000)

            if (!UnityAds.isInitialized()) {
                initUnityAds()
            } else {
                if (confirmedPlacement == null && nextPlacementToLoad() == null) {
                    disabledPlacements.clear()
                }
                loadRewardedAds()
            }
        }
    }

    private fun showReadyPlacement(placementId: String, callbackId: String) {
        readyPlacement = null
        UnityAds.show(
            this@MainActivity,
            placementId,
            UnityAdsShowOptions(),
            object : IUnityAdsShowListener {
                override fun onUnityAdsShowFailure(
                    failedId: String?,
                    error: UnityAds.UnityAdsShowError?,
                    message: String?
                ) {
                    val resolvedId = failedId ?: placementId
                    val reason = "Unity show failed [$resolvedId] (${error ?: "UNKNOWN"}): ${message ?: "Unknown error"}"
                    runOnUiThread {
                        lastAdErrorReason = reason
                        loadRewardedAds()
                        dispatchAdResult(callbackId, false, resolvedId, reason)
                    }
                }

                override fun onUnityAdsShowStart(startedId: String?) {}

                override fun onUnityAdsShowClick(clickedId: String?) {}

                override fun onUnityAdsShowComplete(
                    completedId: String?,
                    state: UnityAds.UnityAdsShowCompletionState?
                ) {
                    val resolvedId = completedId ?: placementId
                    val completed = state == UnityAds.UnityAdsShowCompletionState.COMPLETED
                    val reason = if (completed) "" else "Rewarded ad was skipped before completion."
                    runOnUiThread {
                        if (completed) {
                            lastAdErrorReason = ""
                        } else {
                            lastAdErrorReason = reason
                        }
                        loadRewardedAds()
                        dispatchAdResult(callbackId, completed, resolvedId, reason)
                    }
                }
            }
        )
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
