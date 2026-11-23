# COSMIC AI — Real-Time 3D Voice Companion & Android APK

COSMIC AI is a full-stack real-time voice-to-voice AI companion featuring interactive 3D characters (Blue Knight Normal Mode & Purple Knight Badmash Mode), Gemini Live audio streaming, and safe Android device actions.

---

## Downloading the Android Debug APK

Every push to `main` (or manual workflow dispatch) runs `.github/workflows/build-apk.yml` on GitHub Actions to build `app-debug.apk`, upload it as a workflow artifact, and publish a tagged GitHub Release.

### Why `/releases/latest/download/...` can return `404`

GitHub Release asset URLs use the exact tag structure:

```text
https://github.com/USERNAME/REPOSITORY/releases/download/TAG/app-debug.apk
```

Right after a workflow completes, the convenience alias:

```text
https://github.com/rakeshben767-netizen/Cosmic-ai/releases/latest/download/app-debug.apk
```

can temporarily return **`404`** until GitHub finishes indexing the `latest` release metadata (or if no release has been published yet).

### Most Reliable Way to Download (Direct via Releases Page & Tag)

1. Open the **GitHub Releases** page for this repository:
   `https://github.com/rakeshben767-netizen/Cosmic-ai/releases`
2. Locate the newest release at the top of the page. Its tag follows the format:
   `debug-apk-build-<RUN_NUMBER>-<RUN_ATTEMPT>` (for example, `debug-apk-build-2-1`).
3. Click **`app-debug.apk`** directly under **Assets** on that release, or build the direct tag URL using the visible tag:
   ```text
   https://github.com/rakeshben767-netizen/Cosmic-ai/releases/download/<TAG>/app-debug.apk
   ```
4. If GitHub Releases has not published yet, check **GitHub Actions** (`https://github.com/rakeshben767-netizen/Cosmic-ai/actions`), open the latest workflow run, and download the backup **`app-debug-apk`** build artifact.

---

## APK Diagnostic Checklist

- **APK opens to `Error: Page not found`**:
  - Open `https://github.com/rakeshben767-netizen/Cosmic-ai/actions` and confirm that your latest push from AI Studio triggered a **new workflow run** (e.g. Run `#2` or higher) and that it completed with a green checkmark.
  - Check `https://github.com/rakeshben767-netizen/Cosmic-ai/releases` and make sure you are downloading the APK from the newest `debug-apk-build-<RUN_NUMBER>-1` tag (newer builds bundle the web UI inside `app/src/main/assets/cosmic/` and load locally via `WebViewAssetLoader`).
  - Uninstall the previous `COSMIC AI` APK from your phone before installing the newly downloaded APK.
- **Connecting Live Gemini Voice from the APK**:
  - Real-time Gemini Live voice connects to the backend `/live` WebSocket (`server.ts`), preconfigured by default to `https://cosmic-ai-2.ai.studio`.
  - To host your own backend on **Railway (`railway.app`)**: deploy this GitHub repo (uses `railway.json` + `Dockerfile`), add `GEMINI_API_KEY` under **Variables**, and generate a public Railway domain.
  - Optionally set `VITE_BACKEND_URL` (or `DEFAULT_ANDROID_BACKEND_URL` in `src/hooks/useCosmicLive.ts`) before building the APK.

---

## Local Web Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` using `.env.example` (`GEMINI_API_KEY`).
3. Start the full-stack server (`server.ts` + Vite):
   ```bash
   npm run dev
   ```
4. Build and sync bundled web assets into the Android project:
   ```bash
   npm run build
   ```
