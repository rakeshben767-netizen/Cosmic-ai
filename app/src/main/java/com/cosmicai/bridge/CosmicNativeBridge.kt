package com.cosmicai.bridge

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * COSMIC AI — Safe Android Native Bridge
 * Exposes strictly the 5 approved actions to the WebView / Capacitor layer:
 *   1. openWhatsApp()
 *   2. openApp(appName)
 *   3. openUrl(url)
 *   4. makeCall(phoneNumber)
 *   5. callContact(contactName)
 */
class CosmicNativeBridge(
    private val context: Context,
    private val adRequester: ((placementId: String, callbackId: String) -> Unit)? = null
) {

    private val allowlistedPackages = mapOf(
        "whatsapp" to "com.whatsapp",
        "youtube" to "com.google.android.youtube",
        "instagram" to "com.instagram.android",
        "spotify" to "com.spotify.music",
        "google maps" to "com.google.android.apps.maps",
        "maps" to "com.google.android.apps.maps",
        "gmail" to "com.google.android.gm",
        "telegram" to "org.telegram.messenger",
        "chrome" to "com.android.chrome",
        "calendar" to "com.google.android.calendar"
    )

    private fun jsonResult(
        ok: Boolean,
        message: String,
        matches: List<Pair<String, String>>? = null
    ): String {
        val obj = JSONObject()
        obj.put("ok", ok)
        obj.put("message", message)
        if (matches != null) {
            val arr = JSONArray()
            for ((name, phone) in matches) {
                arr.put(JSONObject().apply {
                    put("name", name)
                    put("phoneNumber", phone)
                })
            }
            obj.put("matches", arr)
        }
        return obj.toString()
    }

    @JavascriptInterface
    fun openWhatsApp(): String {
        return openApp("whatsapp")
    }

    @JavascriptInterface
    fun openApp(appName: String?): String {
        val key = appName?.trim()?.lowercase() ?: ""
        if (key == "settings") {
            val intent = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return jsonResult(true, "Opened Android Settings.")
        }
        if (key == "camera") {
            val intent = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            return try {
                context.startActivity(intent)
                jsonResult(true, "Opened Camera.")
            } catch (e: Exception) {
                jsonResult(false, "Unable to open Camera: ${e.message}")
            }
        }
        val pkg = allowlistedPackages[key]
            ?: return jsonResult(false, "App '$appName' is not in Cosmic AI's allowlist.")
        val launchIntent = context.packageManager.getLaunchIntentForPackage(pkg)
            ?: return jsonResult(false, "$appName is not installed on this device.")
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launchIntent)
        return jsonResult(true, "Launched $appName.")
    }

    @JavascriptInterface
    fun openUrl(rawUrl: String?): String {
        val trimmed = rawUrl?.trim() ?: ""
        val uri = try {
            Uri.parse(trimmed)
        } catch (_: Exception) {
            return jsonResult(false, "Malformed URL.")
        }
        if (uri.scheme?.lowercase() != "https") {
            return jsonResult(false, "Only HTTPS URLs are allowed.")
        }
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return jsonResult(true, "Opened $trimmed.")
    }

    @JavascriptInterface
    fun makeCall(rawPhone: String?): String {
        val cleaned = rawPhone?.trim()?.replace(Regex("[\\s\\-().]"), "") ?: ""
        if (!Regex("^\\+?[0-9]{7,15}$").matches(cleaned)) {
            return jsonResult(false, "Invalid phone number format.")
        }
        val hasCallPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED

        val action = if (hasCallPerm) Intent.ACTION_CALL else Intent.ACTION_DIAL
        val intent = Intent(action, Uri.parse("tel:$cleaned")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return if (hasCallPerm) {
            jsonResult(true, "Calling $cleaned.")
        } else {
            jsonResult(true, "Opened dialer for $cleaned. Tap call to confirm.")
        }
    }

    @JavascriptInterface
    fun callContact(contactName: String?): String {
        val query = contactName?.trim() ?: ""
        if (query.isEmpty()) {
            return jsonResult(false, "Contact name is required.")
        }
        val hasContactsPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasContactsPerm) {
            return jsonResult(
                false,
                "Contacts permission (READ_CONTACTS) is not granted. Please enable it in App Settings."
            )
        }

        val matches = mutableListOf<Pair<String, String>>()
        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
            arrayOf("%$query%"),
            null
        )

        cursor?.use {
            val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (it.moveToNext()) {
                val name = it.getString(nameIdx) ?: continue
                val num = it.getString(numIdx) ?: continue
                matches.add(name to num)
            }
        }

        return when {
            matches.isEmpty() -> jsonResult(false, "No contact found matching '$query'.")
            matches.size == 1 -> makeCall(matches[0].second)
            else -> jsonResult(
                false,
                "Multiple contacts matched '$query'. Ask the user which one to call.",
                matches.take(5)
            )
        }
    }

    @JavascriptInterface
    fun showInterstitialAd(callbackId: String?): String {
        return showRewardedAd(callbackId)
    }

    @JavascriptInterface
    fun showRewardedAd(callbackId: String?): String {
        val safeId = (callbackId ?: "").trim()
        if (safeId.isEmpty() || adRequester == null) {
            return jsonResult(false, "Native Unity Rewarded unavailable.")
        }
        adRequester.invoke("Rewarded_Android", safeId)
        return jsonResult(true, "Triggered Unity Rewarded.")
    }

    @JavascriptInterface
    fun getUnityAdsConfig(): String {
        return JSONObject().apply {
            put("gameId", "800426177")
            put("organizationCoreId", "13470006284888")
            put("rewardedPlacement", "Rewarded_Android")
        }.toString()
    }
}
