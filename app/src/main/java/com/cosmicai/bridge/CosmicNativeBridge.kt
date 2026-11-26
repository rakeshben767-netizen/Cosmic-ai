package com.cosmicai.bridge

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import com.cosmicai.app.MainActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * COSMIC AI — Safe Android Native Bridge
 */
class CosmicNativeBridge(private val context: Context) {

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
        "google" to "com.google.android.googlequicksearchbox",
        "calendar" to "com.google.android.calendar",
        "gallery" to "com.google.android.apps.photos",
        "photos" to "com.google.android.apps.photos",
        "google photos" to "com.google.android.apps.photos",
        "clock" to "com.google.android.deskclock",
        "alarm" to "com.google.android.deskclock",
        "timer" to "com.google.android.deskclock"
    )

    private fun jsonResult(
        ok: Boolean,
        message: String,
        matches: List<Pair<String, String>>? = null,
        extra: Map<String, Any?> = emptyMap()
    ): String {
        val obj = JSONObject()
        obj.put("ok", ok)
        obj.put("message", message)
        for ((k, v) in extra) {
            if (v != null) obj.put(k, v)
        }
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
    fun openWhatsApp(): String = openApp("whatsapp")

    @JavascriptInterface
    fun openApp(appName: String?): String {
        val key = appName?.trim()?.lowercase() ?: ""
        if (key == "settings") {
            return try {
                val intent = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                jsonResult(true, "Opened Android Settings.")
            } catch (e: Exception) {
                jsonResult(false, "Unable to open Settings: ${e.message}")
            }
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
        return try {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launchIntent)
            jsonResult(true, "Launched $appName.")
        } catch (e: Exception) {
            jsonResult(false, "Could not launch $appName: ${e.message}")
        }
    }

    @JavascriptInterface
    fun openYouTubeSearch(rawQuery: String?): String {
        val query = rawQuery?.trim()?.replace(Regex("\\s+"), " ") ?: ""
        if (query.isEmpty()) {
            return jsonResult(false, "YouTube search query cannot be empty.")
        }
        if (query.length > 160) {
            return jsonResult(false, "YouTube search query is too long.")
        }

        val searchUrl = "https://www.youtube.com/results?search_query=${Uri.encode(query)}"
        val searchUri = Uri.parse(searchUrl)

        val ytAppIntent = Intent(Intent.ACTION_VIEW, searchUri).apply {
            setPackage("com.google.android.youtube")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (ytAppIntent.resolveActivity(context.packageManager) != null) {
            return try {
                context.startActivity(ytAppIntent)
                jsonResult(
                    ok = true,
                    message = "Opened YouTube app search for \"$query\".",
                    extra = mapOf("url" to searchUrl, "target" to "youtube_app")
                )
            } catch (e: Exception) {
                jsonResult(false, "Failed to open YouTube search: ${e.message}")
            }
        }

        val browserIntent = Intent(Intent.ACTION_VIEW, searchUri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (browserIntent.resolveActivity(context.packageManager) != null) {
            return try {
                context.startActivity(browserIntent)
                jsonResult(
                    ok = true,
                    message = "YouTube app unavailable; opened YouTube search in browser for \"$query\".",
                    extra = mapOf("url" to searchUrl, "target" to "browser_fallback")
                )
            } catch (e: Exception) {
                jsonResult(false, "Unable to open browser for YouTube search: ${e.message}")
            }
        }

        return jsonResult(false, "Neither YouTube app nor a web browser could open \"$query\".")
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
        return try {
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            jsonResult(true, "Opened $trimmed.")
        } catch (e: Exception) {
            jsonResult(false, "Could not open URL: ${e.message}")
        }
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
        return try {
            val intent = Intent(action, Uri.parse("tel:$cleaned")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            if (hasCallPerm) {
                jsonResult(true, "Calling $cleaned.")
            } else {
                jsonResult(true, "Opened dialer for $cleaned. Tap call to confirm.")
            }
        } catch (e: Exception) {
            jsonResult(false, "Unable to open phone dialer: ${e.message}")
        }
    }

    private fun lookupContactsInternal(query: String): Pair<String?, List<Pair<String, String>>> {
        val hasContactsPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasContactsPerm) {
            if (context is MainActivity) {
                context.requestContactsPermissionOnDemand()
            }
            return "Contacts permission is required to search contacts. Please tap Allow on the permission prompt and try again." to emptyList()
        }

        val matches = mutableListOf<Pair<String, String>>()
        val seenKeys = HashSet<String>()
        val lowerQuery = query.lowercase()

        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            ),
            "LOWER(${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME}) LIKE ?",
            arrayOf("%$lowerQuery%"),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        )

        cursor?.use {
            val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (it.moveToNext()) {
                val name = it.getString(nameIdx)?.trim() ?: continue
                val rawNum = it.getString(numIdx)?.trim() ?: continue
                val cleanNum = rawNum.replace(Regex("[\\s\\-().]"), "")
                if (!Regex("^\\+?[0-9]{7,15}$").matches(cleanNum)) continue
                val dedupKey = "${name.lowercase()}::$cleanNum"
                if (seenKeys.add(dedupKey)) {
                    matches.add(name to cleanNum)
                }
            }
        }

        val exactMatches = matches.filter { it.first.equals(query, ignoreCase = true) }
        val ranked = if (exactMatches.isNotEmpty()) exactMatches else matches
        return null to ranked
    }

    @JavascriptInterface
    fun findContact(contactName: String?): String {
        val query = contactName?.trim() ?: ""
        if (query.isEmpty()) {
            return jsonResult(false, "Contact name is required.")
        }

        val (permErr, matches) = lookupContactsInternal(query)
        if (permErr != null) {
            return jsonResult(false, permErr, extra = mapOf("status" to "permission_required"))
        }

        return when {
            matches.isEmpty() -> jsonResult(
                ok = false,
                message = "No contact found matching '$query'.",
                extra = mapOf("status" to "not_found")
            )
            matches.size == 1 -> jsonResult(
                ok = true,
                message = "Found contact '${matches[0].first}'.",
                matches = matches,
                extra = mapOf("status" to "contact_resolved")
            )
            else -> jsonResult(
                ok = false,
                message = "Multiple contacts matched '$query'. Ask the user which one they mean.",
                matches = matches.take(5),
                extra = mapOf("status" to "multiple_matches")
            )
        }
    }

    @JavascriptInterface
    fun openWhatsAppChat(rawPhone: String?, rawMessage: String?): String {
        val cleaned = rawPhone?.trim()?.replace(Regex("[^0-9]"), "") ?: ""
        if (cleaned.length < 7 || cleaned.length > 15) {
            return jsonResult(false, "Invalid phone number for WhatsApp chat.")
        }
        val msg = rawMessage?.trim() ?: ""
        val waUrl = if (msg.isNotEmpty()) {
            "https://api.whatsapp.com/send?phone=$cleaned&text=${Uri.encode(msg)}"
        } else {
            "https://api.whatsapp.com/send?phone=$cleaned"
        }

        val waPackages = listOf("com.whatsapp", "com.whatsapp.w4b")
        for (pkg in waPackages) {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(waUrl)).apply {
                setPackage(pkg)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (intent.resolveActivity(context.packageManager) != null) {
                try {
                    context.startActivity(intent)
                    return jsonResult(
                        ok = true,
                        message = "Opened WhatsApp chat with prepared message ready to send.",
                        extra = mapOf("state" to "whatsapp_opened")
                    )
                } catch (_: Exception) {
                    // try next candidate
                }
            }
        }

        val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse(waUrl)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(fallbackIntent)
            jsonResult(
                ok = true,
                message = "Opened WhatsApp chat link with prepared message ready to send.",
                extra = mapOf("state" to "whatsapp_opened")
            )
        } catch (e: Exception) {
            jsonResult(
                ok = false,
                message = "WhatsApp could not be opened on this device: ${e.message}",
                extra = mapOf("state" to "message_prepared")
            )
        }
    }

    @JavascriptInterface
    fun callContact(contactName: String?): String {
        val query = contactName?.trim() ?: ""
        if (query.isEmpty()) {
            return jsonResult(false, "Contact name is required.")
        }

        val (permErr, matches) = lookupContactsInternal(query)
        if (permErr != null) {
            return jsonResult(false, permErr)
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
}
