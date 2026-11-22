export interface NativeActionResponse {
  ok: boolean;
  message: string;
  matches?: Array<{ name: string; phoneNumber: string }>;
}

export interface CosmicNativeBridge {
  openWhatsApp(): Promise<NativeActionResponse>;
  openApp(appName: string): Promise<NativeActionResponse>;
  openUrl(url: string): Promise<NativeActionResponse>;
  makeCall(phoneNumber: string): Promise<NativeActionResponse>;
  callContact(contactName: string): Promise<NativeActionResponse>;
}

interface RawAndroidWebViewBridge {
  openWhatsApp?: () => string;
  openApp?: (appName: string) => string;
  openUrl?: (url: string) => string;
  makeCall?: (phoneNumber: string) => string;
  callContact?: (contactName: string) => string;
}

interface RawCapacitorWindow {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      CosmicActions?: CosmicNativeBridge;
    };
  };
  CosmicAndroidBridge?: RawAndroidWebViewBridge;
}

function safeParseBridgeJson(raw: string, fallbackAction: string): NativeActionResponse {
  try {
    const parsed = JSON.parse(raw) as Partial<NativeActionResponse>;
    return {
      ok: Boolean(parsed.ok),
      message:
        typeof parsed.message === 'string' && parsed.message.length > 0
          ? parsed.message
          : `${fallbackAction} returned an empty status.`,
      matches: Array.isArray(parsed.matches) ? parsed.matches : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Native bridge parse failure for ${fallbackAction}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

export function getCosmicNativeBridge(): CosmicNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as RawCapacitorWindow;

  const capPlugin = win.Capacitor?.Plugins?.CosmicActions;
  if (capPlugin && typeof capPlugin.openWhatsApp === 'function') {
    return capPlugin;
  }

  const webViewBridge = win.CosmicAndroidBridge;
  if (webViewBridge && typeof webViewBridge.openWhatsApp === 'function') {
    return {
      async openWhatsApp() {
        return safeParseBridgeJson(webViewBridge.openWhatsApp!(), 'openWhatsApp');
      },
      async openApp(appName: string) {
        if (!webViewBridge.openApp) {
          return { ok: false, message: 'openApp is not exposed by Android bridge.' };
        }
        return safeParseBridgeJson(webViewBridge.openApp(appName), 'openApp');
      },
      async openUrl(url: string) {
        if (!webViewBridge.openUrl) {
          return { ok: false, message: 'openUrl is not exposed by Android bridge.' };
        }
        return safeParseBridgeJson(webViewBridge.openUrl(url), 'openUrl');
      },
      async makeCall(phoneNumber: string) {
        if (!webViewBridge.makeCall) {
          return { ok: false, message: 'makeCall is not exposed by Android bridge.' };
        }
        return safeParseBridgeJson(webViewBridge.makeCall(phoneNumber), 'makeCall');
      },
      async callContact(contactName: string) {
        if (!webViewBridge.callContact) {
          return { ok: false, message: 'callContact is not exposed by Android bridge.' };
        }
        return safeParseBridgeJson(webViewBridge.callContact(contactName), 'callContact');
      },
    };
  }

  return null;
}

export function detectBridgeEnvironment(): {
  hasNativeBridge: boolean;
  runtimeLabel: string;
} {
  if (typeof window === 'undefined') {
    return { hasNativeBridge: false, runtimeLabel: 'Server' };
  }
  const win = window as unknown as RawCapacitorWindow;
  if (win.Capacitor?.Plugins?.CosmicActions) {
    return { hasNativeBridge: true, runtimeLabel: 'Capacitor Android Bridge' };
  }
  if (win.CosmicAndroidBridge) {
    return { hasNativeBridge: true, runtimeLabel: 'Android WebView Bridge' };
  }
  const isAndroidBrowser = /Android/i.test(navigator.userAgent);
  return {
    hasNativeBridge: false,
    runtimeLabel: isAndroidBrowser ? 'Android Browser (Web Fallback)' : 'Desktop Web Browser',
  };
}
