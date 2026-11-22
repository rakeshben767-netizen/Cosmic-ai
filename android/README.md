# COSMIC AI — Android APK Native Bridge

For packaging COSMIC AI as an Android APK (via Capacitor or Android WebView):

1. Add `CosmicNativeBridge.kt` to your Android project (`com.cosmicai.bridge`).
2. Register the bridge on your WebView:
   ```kotlin
   webView.addJavascriptInterface(CosmicNativeBridge(this), "CosmicAndroidBridge")
   ```
   Or wrap the same 5 methods inside a Capacitor `@CapacitorPlugin(name = "CosmicActions")` plugin.
3. Ensure `AndroidManifest.xml` declares:
   - `android.permission.RECORD_AUDIO`
   - `android.permission.MODIFY_AUDIO_SETTINGS`
   - `android.permission.READ_CONTACTS` (optional, required for `callContact`)
   - `android.permission.CALL_PHONE` (optional; falls back to `Intent.ACTION_DIAL` when denied)
4. Only the 5 allowlisted methods (`openWhatsApp`, `openApp`, `openUrl`, `makeCall`, `callContact`) are exposed.
