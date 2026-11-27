package com.cosmicai.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.webkit.WebViewAssetLoader
import com.cosmicai.ads.UnityAdsManager
import com.cosmicai.bridge.CosmicNativeBridge
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var rootContainer: FrameLayout
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val requestPermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val pending = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            if (pending != null) {
                val needsAudio = pending.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                val audioOk = !needsAudio || results[Manifest.permission.RECORD_AUDIO] == true || hasPermission(Manifest.permission.RECORD_AUDIO)
                if (audioOk) {
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
            setBackgroundColor(Color.parseColor("#0c1220"))
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
                CosmicNativeBridge(this@MainActivity),
                "CosmicAndroidBridge"
            )
        }

        rootContainer = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0c1220"))
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

        UnityAdsManager.attachActivity(this)
        UnityAdsManager.initialize(applicationContext)
        observeUnityAds()

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pushUnityStateToWebView()
            }
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
                    val missing = mutableListOf<String>()
                    if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
                        !hasPermission(Manifest.permission.RECORD_AUDIO)
                    ) {
                        missing.add(Manifest.permission.RECORD_AUDIO)
                    }
                    if (missing.isNotEmpty()) {
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        requestPermissionsLauncher.launch(missing.toTypedArray())
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

        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    fun hasPermission(perm: String): Boolean {
        return ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED
    }

    fun requestContactsPermissionOnDemand() {
        runOnUiThread {
            if (!hasPermission(Manifest.permission.READ_CONTACTS)) {
                requestPermissionsLauncher.launch(arrayOf(Manifest.permission.READ_CONTACTS))
            }
        }
    }

    private fun observeUnityAds() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    UnityAdsManager.userMessages.collect { message ->
                        Snackbar.make(rootContainer, message, Snackbar.LENGTH_LONG).show()
                        val quoted = JSONObject.quote(message)
                        webView.evaluateJavascript(
                            "window.__onCosmicUnityAdsMessage && window.__onCosmicUnityAdsMessage($quoted);",
                            null
                        )
                    }
                }
                launch {
                    UnityAdsManager.ruleEvents.collect { event ->
                        val payload = event.toJson().toString()
                        webView.evaluateJavascript(
                            "window.__onCosmicUnityAdsRuleEvent && window.__onCosmicUnityAdsRuleEvent($payload);",
                            null
                        )
                    }
                }
                launch {
                    combine(
                        UnityAdsManager.sdkStatus,
                        UnityAdsManager.rewardedState,
                        UnityAdsManager.interstitialState,
                        UnityAdsManager.counters
                    ) { _, _, _, _ ->
                        UnityAdsManager.getSnapshotJson().toString()
                    }.collect { snapshotJson ->
                        webView.evaluateJavascript(
                            "window.__onCosmicUnityAdsState && window.__onCosmicUnityAdsState($snapshotJson);",
                            null
                        )
                    }
                }
            }
        }
    }

    private fun pushUnityStateToWebView() {
        val snapshotJson = UnityAdsManager.getSnapshotJson().toString()
        webView.evaluateJavascript(
            "window.__onCosmicUnityAdsState && window.__onCosmicUnityAdsState($snapshotJson);",
            null
        )
    }

    override fun onResume() {
        super.onResume()
        UnityAdsManager.attachActivity(this)
    }

    override fun onDestroy() {
        UnityAdsManager.detachActivity(this)
        webView.destroy()
        super.onDestroy()
    }
}
