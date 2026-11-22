package com.cosmicai.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.cosmicai.bridge.CosmicNativeBridge

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var errorOverlay: LinearLayout
    private lateinit var errorText: TextView
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val prefs by lazy {
        getSharedPreferences("cosmic_ai_prefs", MODE_PRIVATE)
    }

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
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0D101B"))
        }

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
            addJavascriptInterface(CosmicNativeBridge(this@MainActivity), "CosmicAndroidBridge")
        }

        errorText = TextView(this).apply {
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(24, 0, 24, 24)
        }

        val retryBtn = Button(this).apply {
            text = "Retry Connection"
            setOnClickListener {
                errorOverlay.visibility = View.GONE
                webView.loadUrl(getConfiguredServerUrl())
            }
        }

        val urlBtn = Button(this).apply {
            text = "Set Server URL"
            setOnClickListener { promptServerUrl() }
        }

        errorOverlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0D101B"))
            setPadding(48, 48, 48, 48)
            visibility = View.GONE
            addView(errorText)
            addView(retryBtn)
            addView(urlBtn)
        }

        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        root.addView(
            errorOverlay,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)

        webView.webViewClient = object : WebViewClient() {
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
                val activeHost = Uri.parse(getConfiguredServerUrl()).host
                if (scheme == "https" && url.host != activeHost) {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (url != null && !url.startsWith("about:")) {
                    errorOverlay.visibility = View.GONE
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    errorText.text =
                        "Unable to reach COSMIC AI server (${error?.description ?: "Network error"}).\n\nURL: ${getConfiguredServerUrl()}"
                    errorOverlay.visibility = View.VISIBLE
                }
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

        requestInitialPermissions()
        webView.loadUrl(getConfiguredServerUrl())
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

    private fun getConfiguredServerUrl(): String {
        val saved = prefs.getString("server_url", null)?.trim()
        if (!saved.isNullOrEmpty() && saved.startsWith("https://")) {
            return saved
        }
        return getString(R.string.cosmic_server_url)
    }

    private fun promptServerUrl() {
        val input = EditText(this).apply {
            setText(getConfiguredServerUrl())
            hint = "https://your-cosmic-ai-url"
        }
        AlertDialog.Builder(this)
            .setTitle("COSMIC AI Server URL")
            .setMessage("Enter the HTTPS URL where your COSMIC AI backend is hosted:")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val nextUrl = input.text.toString().trim()
                if (nextUrl.startsWith("https://")) {
                    prefs.edit().putString("server_url", nextUrl).apply()
                    errorOverlay.visibility = View.GONE
                    webView.loadUrl(nextUrl)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
