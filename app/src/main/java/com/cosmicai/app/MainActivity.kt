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
        private const val UNITY_GAME_ID = "800447797"
        private const val UNITY_TEST_MODE = false
        private const val PLACEMENT_REWARDED_PRIMARY = "Rewarded_Android"
        private const val PLACEMENT_REWARDED_LEGACY = "BP_Rewarded_Android"
        private val REWARDED_PLACEMENTS = listOf(
            PLACEMENT_REWARDED_PRIMARY,
            PLACEMENT_REWARDED_LEGACY
        )
    }

    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private val readyPlacements = ConcurrentHashMap<String, Boolean>()
    private val loadingPlacements = ConcurrentHashMap<String, Boolean>()
    private val mainHandler = Handler(Looper.getMainLooper())
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

    private fun findReadyRewardedPlacement(): String? {
        return REWARDED_PLACEMENTS.firstOrNull { readyPlacements[it] == true }
    }

    private fun initUnityAds() {
        if (UnityAds.isInitialized) {
            loadRewardedPlacements()
            return
        }
        UnityAds.initialize(
            applicationContext,
            UNITY_GAME_ID,
            UNITY_TEST_MODE,
            object : IUnityAdsInitializationListener {
                override fun onInitializationComplete() {
                    runOnUiThread {
                        lastAdErrorReason = ""
                        loadRewardedPlacements()
                    }
                }

                override fun onInitializationFailed(
                    error: UnityAds.UnityAdsInitializationError?,
                    message: String?
                ) {
                    val reason = "Unity init failed (${error?.name ?: "UNKNOWN"}): ${message ?: "check network/Game ID"}"
                    runOnUiThread {
                        for (pid in REWARDED_PLACEMENTS) {
                            readyPlacements[pid] = false
                            loadingPlacements[pid] = false
                        }
                        lastAdErrorReason = reason
                        resolvePendingShowFailure(reason)
                        mainHandler.postDelayed({
                            if (!isDestroyed && !UnityAds.isInitialized) {
                                initUnityAds()
                            }
                        }, 10000)
                    }
                }
            }
        )
    }

    private fun loadRewardedPlacements() {
        for (pid in REWARDED_PLACEMENTS) {
            loadPlacement(pid)
        }
    }

    private fun loadPlacement(placementId: String) {
        if (!UnityAds.isInitialized) return
        if (readyPlacements[placementId] == true || loadingPlacements[placementId] == true) return
        loadingPlacements[placementId] = true
        readyPlacements[placementId] = false
        UnityAds.load(placementId, object : IUnityAdsLoadListener {
            override fun onUnityAdsAdLoaded(pid: String?) {
                val targetPid = pid ?: placementId
                runOnUiThread {
                    loadingPlacements[targetPid] = false
                    readyPlacements[targetPid] = true
                    lastAdErrorReason = ""
                    val pendingCb = pendingShowCallbackId
                    if (pendingCb != null) {
                        pendingShowCallbackId = null
                        pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                        pendingShowTimeoutRunnable = null
                        showReadyAd(targetPid, pendingCb)
                    }
                }
            }

            override fun onUnityAdsFailedToLoad(
                pid: String?,
                error: UnityAds.UnityAdsLoadError?,
                message: String?
            ) {
                val targetPid = pid ?: placementId
                val rawMsg = message ?: "no ad available right now"
                val reason = if (rawMsg.contains("adMarkup", ignoreCase = true) ||
                    rawMsg.contains("objectId", ignoreCase = true)
                ) {
                    "Unity Dashboard error ($targetPid is set to Bidding/Mediation). Create a non-bidding Waterfall placement named 'Rewarded_Android' in Unity Dashboard."
                } else {
                    "Unity ad failed [$targetPid] (${error?.name ?: "NO_FILL"}): $rawMsg"
                }
                runOnUiThread {
                    loadingPlacements[targetPid] = false
                    readyPlacements[targetPid] = false
                    if (findReadyRewardedPlacement() == null) {
                        lastAdErrorReason = reason
                    }
                    val anyOtherLoadingOrReady = REWARDED_PLACEMENTS.any {
                        readyPlacements[it] == true || loadingPlacements[it] == true
                    }
                    if (!anyOtherLoadingOrReady) {
                        resolvePendingShowFailure(lastAdErrorReason.ifEmpty { reason })
                    }
                    mainHandler.postDelayed({
                        if (!isDestroyed && UnityAds.isInitialized) {
                            loadPlacement(targetPid)
                        }
                    }, 15000)
                }
            }
        })
    }

    private fun resolvePendingShowFailure(reason: String) {
        val pendingCb = pendingShowCallbackId ?: return
        pendingShowCallbackId = null
        pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingShowTimeoutRunnable = null
        dispatchAdResult(pendingCb, false, PLACEMENT_REWARDED_PRIMARY, reason)
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
            val readyPid = findReadyRewardedPlacement()
            if (readyPid != null) {
                pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                pendingShowTimeoutRunnable = null
                pendingShowCallbackId = null
                showReadyAd(readyPid, callbackId)
                return@runOnUiThread
            }

            pendingShowTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            val previousCb = pendingShowCallbackId
            if (previousCb != null && previousCb != callbackId) {
                dispatchAdResult(previousCb, false, PLACEMENT_REWARDED_PRIMARY, "Superseded by newer ad request.")
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
                    dispatchAdResult(callbackId, false, PLACEMENT_REWARDED_PRIMARY, reason)
                }
            }
            pendingShowTimeoutRunnable = timeoutRunnable
            mainHandler.postDelayed(timeoutRunnable, 8000)

            if (!UnityAds.isInitialized) {
                initUnityAds()
            } else {
                loadRewardedPlacements()
            }
        }
    }

    private fun showReadyAd(targetPlacement: String, callbackId: String) {
        readyPlacements[targetPlacement] = false
        UnityAds.show(
            this@MainActivity,
            targetPlacement,
            UnityAdsShowOptions(),
            object : IUnityAdsShowListener {
                override fun onUnityAdsShowFailure(
                    pid: String?,
                    error: UnityAds.UnityAdsShowError?,
                    message: String?
                ) {
                    val reason = "Unity show failed (${error?.name ?: "UNKNOWN"}): ${message ?: "display error"}"
                    lastAdErrorReason = reason
                    loadPlacement(targetPlacement)
                    dispatchAdResult(callbackId, false, targetPlacement, reason)
                }

                override fun onUnityAdsShowStart(pid: String?) {}

                override fun onUnityAdsShowClick(pid: String?) {}

                override fun onUnityAdsShowComplete(
                    pid: String?,
                    state: UnityAds.UnityAdsShowCompletionState?
                ) {
                    loadPlacement(targetPlacement)
                    val completed = state == UnityAds.UnityAdsShowCompletionState.COMPLETED
                    val reason = if (completed) "" else "Rewarded ad was skipped before finishing."
                    dispatchAdResult(callbackId, completed, targetPlacement, reason)
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
