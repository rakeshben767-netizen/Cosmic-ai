import type {
  ActionLogEntry,
  PendingWhatsAppDraft,
  SafeActionName,
} from '../types/cosmic.ts';
import type { CosmicNativeBridge } from './androidBridge.ts';

export interface AllowlistedAppSpec {
  id: string;
  displayName: string;
  aliases: string[];
  androidPackage: string;
  webUrl: string | null;
  requiresNativeBridge?: boolean;
}

export const ALLOWLISTED_APPS: AllowlistedAppSpec[] = [
  {
    id: 'whatsapp',
    displayName: 'WhatsApp',
    aliases: ['whatsapp', 'whats app', 'wa'],
    androidPackage: 'com.whatsapp',
    webUrl: 'https://wa.me/',
  },
  {
    id: 'youtube',
    displayName: 'YouTube',
    aliases: ['youtube', 'yt', 'you tube'],
    androidPackage: 'com.google.android.youtube',
    webUrl: 'https://www.youtube.com',
  },
  {
    id: 'instagram',
    displayName: 'Instagram',
    aliases: ['instagram', 'insta', 'ig'],
    androidPackage: 'com.instagram.android',
    webUrl: 'https://www.instagram.com',
  },
  {
    id: 'spotify',
    displayName: 'Spotify',
    aliases: ['spotify'],
    androidPackage: 'com.spotify.music',
    webUrl: 'https://open.spotify.com',
  },
  {
    id: 'google_maps',
    displayName: 'Google Maps',
    aliases: ['maps', 'google maps', 'navigation'],
    androidPackage: 'com.google.android.apps.maps',
    webUrl: 'https://maps.google.com',
  },
  {
    id: 'gmail',
    displayName: 'Gmail',
    aliases: ['gmail', 'mail', 'email'],
    androidPackage: 'com.google.android.gm',
    webUrl: 'https://mail.google.com',
  },
  {
    id: 'telegram',
    displayName: 'Telegram',
    aliases: ['telegram', 'tg'],
    androidPackage: 'org.telegram.messenger',
    webUrl: 'https://web.telegram.org',
  },
  {
    id: 'chrome',
    displayName: 'Chrome',
    aliases: ['chrome', 'browser', 'google chrome'],
    androidPackage: 'com.android.chrome',
    webUrl: 'https://www.google.com',
  },
  {
    id: 'google',
    displayName: 'Google',
    aliases: ['google', 'google app', 'google search'],
    androidPackage: 'com.google.android.googlequicksearchbox',
    webUrl: 'https://www.google.com',
  },
  {
    id: 'camera',
    displayName: 'Camera',
    aliases: ['camera', 'cam'],
    androidPackage: 'android.media.action.IMAGE_CAPTURE',
    webUrl: null,
    requiresNativeBridge: true,
  },
  {
    id: 'settings',
    displayName: 'Settings',
    aliases: ['settings', 'setting', 'device settings', 'phone settings'],
    androidPackage: 'android.settings.SETTINGS',
    webUrl: null,
    requiresNativeBridge: true,
  },
  {
    id: 'calendar',
    displayName: 'Calendar',
    aliases: ['calendar', 'google calendar'],
    androidPackage: 'com.google.android.calendar',
    webUrl: 'https://calendar.google.com',
  },
];

export type AppResolutionResult =
  | { allowed: true; app: AllowlistedAppSpec }
  | { allowed: false; reason: string };

export function resolveAppTarget(rawAppName: string): AppResolutionResult {
  if (!rawAppName || typeof rawAppName !== 'string') {
    return { allowed: false, reason: 'Application name is missing.' };
  }
  const normalized = rawAppName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) {
    return { allowed: false, reason: 'Application name is empty.' };
  }
  // Reject arbitrary raw Android package names such as com.foo.bar
  if (/^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_.]+$/i.test(normalized)) {
    return {
      allowed: false,
      reason: 'Arbitrary package names are not permitted. Use a standard application name.',
    };
  }

  const matched = ALLOWLISTED_APPS.find(
    (app) => app.displayName.toLowerCase() === normalized || app.aliases.includes(normalized),
  );
  if (!matched) {
    return {
      allowed: false,
      reason: `Application "${rawAppName.trim()}" is not in Cosmic AI's allowlisted apps.`,
    };
  }
  return { allowed: true, app: matched };
}

export type YouTubeSearchValidationResult =
  | { valid: true; query: string; url: string }
  | { valid: false; reason: string };

export function buildYouTubeSearchUrl(rawQuery: string): YouTubeSearchValidationResult {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { valid: false, reason: 'YouTube search query is required.' };
  }
  const cleanQuery = rawQuery.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanQuery) {
    return { valid: false, reason: 'YouTube search query cannot be empty.' };
  }
  if (cleanQuery.length > 160) {
    return { valid: false, reason: 'YouTube search query must be 160 characters or fewer.' };
  }
  return {
    valid: true,
    query: cleanQuery,
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`,
  };
}

export type UrlValidationResult =
  | { valid: true; url: string }
  | { valid: false; reason: string };

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:', 'intent:', 'blob:', 'about:'];

export function validateSafeUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, reason: 'URL is required.' };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL cannot be empty.' };
  }

  const lower = trimmed.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lower.startsWith(scheme)) {
      return { valid: false, reason: `Unsafe URL scheme "${scheme}" is blocked.` };
    }
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, reason: `Unsupported protocol "${parsed.protocol}".` };
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { valid: false, reason: 'URL must include a valid public domain.' };
    }
    // Prefer HTTPS
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, reason: 'Malformed URL.' };
  }
}

export type PhoneValidationResult =
  | { valid: true; normalized: string; telUri: string }
  | { valid: false; reason: string };

export function validatePhoneNumber(rawPhone: string): PhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, reason: 'Phone number is required.' };
  }
  const cleaned = rawPhone.trim().replace(/[\s\-().]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(cleaned)) {
    return {
      valid: false,
      reason: 'Invalid phone number. Provide 7 to 15 digits with optional leading +.',
    };
  }
  return {
    valid: true,
    normalized: cleaned,
    telUri: `tel:${cleaned}`,
  };
}

export function sanitizeActionArgsForLog(
  action: SafeActionName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'phoneNumber') {
      sanitized[k] = '[redacted]';
    } else if (k === 'message') {
      const len = typeof v === 'string' ? v.trim().length : 0;
      sanitized[k] = `[redacted len=${len}]`;
    } else {
      sanitized[k] = v;
    }
  }
  if (action === 'draftWhatsAppMessage' || action === 'sendWhatsAppMessage') {
    sanitized.redactedSensitiveContent = true;
  }
  return sanitized;
}

function triggerBrowserLink(url: string, newTab: boolean): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const link = document.createElement('a');
    link.href = url;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    return false;
  }
}

export async function executeSafeToolCall(
  name: string,
  args: Record<string, unknown>,
  bridge: CosmicNativeBridge | null,
): Promise<{
  response: Record<string, unknown>;
  logEntry: ActionLogEntry;
  pendingDraft?: PendingWhatsAppDraft | null;
  clearDraft?: boolean;
}> {
  const timestamp = Date.now();
  const id = `act_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;

  const makeResult = (
    action: SafeActionName,
    ok: boolean,
    message: string,
    via: ActionLogEntry['via'],
    extra: Record<string, unknown> = {},
    fallbackUrl?: string,
    draftControl?: { pendingDraft?: PendingWhatsAppDraft | null; clearDraft?: boolean },
  ) => ({
    response: { ok, message, via, ...extra },
    logEntry: {
      id,
      action,
      args: sanitizeActionArgsForLog(action, args),
      ok,
      message,
      fallbackUrl,
      timestamp,
      via,
    },
    pendingDraft: draftControl?.pendingDraft,
    clearDraft: draftControl?.clearDraft,
  });

  if (name === 'openWhatsApp') {
    if (bridge) {
      const res = await bridge.openWhatsApp();
      return makeResult('openWhatsApp', res.ok, res.message, 'android-bridge');
    }
    const waUrl = 'https://wa.me/';
    const triggered = triggerBrowserLink(waUrl, true);
    return makeResult(
      'openWhatsApp',
      triggered,
      triggered
        ? 'Opened WhatsApp web link (https://wa.me/).'
        : 'Browser environment could not launch WhatsApp automatically.',
      'browser',
      { url: waUrl },
      waUrl,
    );
  }

  if (name === 'openApp') {
    const appName = typeof args.appName === 'string' ? args.appName : '';
    const resolved = resolveAppTarget(appName);
    if (!resolved.allowed) {
      return makeResult('openApp', false, resolved.reason, 'validation');
    }

    if (bridge) {
      const res = await bridge.openApp(resolved.app.displayName);
      return makeResult('openApp', res.ok, res.message, 'android-bridge', {
        appName: resolved.app.displayName,
      });
    }

    if (resolved.app.requiresNativeBridge || !resolved.app.webUrl) {
      return makeResult(
        'openApp',
        false,
        `${resolved.app.displayName} requires the Cosmic AI Android APK native bridge and cannot be launched directly from a web browser.`,
        'browser',
        { appName: resolved.app.displayName, requiresNativeBridge: true },
      );
    }

    const triggered = triggerBrowserLink(resolved.app.webUrl, true);
    return makeResult(
      'openApp',
      triggered,
      triggered
        ? `Opened ${resolved.app.displayName} via ${resolved.app.webUrl}.`
        : `Could not launch ${resolved.app.displayName} in this browser.`,
      'browser',
      { appName: resolved.app.displayName, url: resolved.app.webUrl },
      resolved.app.webUrl,
    );
  }

  if (name === 'openYouTubeSearch') {
    const rawQuery = typeof args.query === 'string' ? args.query : '';
    const validated = buildYouTubeSearchUrl(rawQuery);
    if (!validated.valid) {
      return makeResult('openYouTubeSearch', false, validated.reason, 'validation');
    }

    if (bridge) {
      const res = await bridge.openYouTubeSearch(validated.query);
      return makeResult(
        'openYouTubeSearch',
        res.ok,
        res.message,
        'android-bridge',
        {
          query: validated.query,
          url: res.url ?? validated.url,
          target: res.target ?? 'youtube_app',
        },
        res.url ?? validated.url,
      );
    }

    const triggered = triggerBrowserLink(validated.url, true);
    return makeResult(
      'openYouTubeSearch',
      triggered,
      triggered
        ? `Opened YouTube search for "${validated.query}".`
        : `Could not open browser for YouTube search "${validated.query}".`,
      'browser',
      { query: validated.query, url: validated.url, target: 'browser' },
      validated.url,
    );
  }

  if (name === 'openUrl') {
    const rawUrl = typeof args.url === 'string' ? args.url : '';
    const validated = validateSafeUrl(rawUrl);
    if (!validated.valid) {
      return makeResult('openUrl', false, validated.reason, 'validation');
    }

    if (bridge) {
      const res = await bridge.openUrl(validated.url);
      return makeResult('openUrl', res.ok, res.message, 'android-bridge', {
        url: validated.url,
      });
    }

    const triggered = triggerBrowserLink(validated.url, true);
    return makeResult(
      'openUrl',
      triggered,
      triggered
        ? `Opened ${validated.url} in a safe new tab.`
        : `Could not open ${validated.url} automatically.`,
      'browser',
      { url: validated.url },
      validated.url,
    );
  }

  if (name === 'makeCall') {
    const rawPhone = typeof args.phoneNumber === 'string' ? args.phoneNumber : '';
    const validated = validatePhoneNumber(rawPhone);
    if (!validated.valid) {
      return makeResult('makeCall', false, validated.reason, 'validation');
    }

    if (bridge) {
      const res = await bridge.makeCall(validated.normalized);
      return makeResult('makeCall', res.ok, res.message, 'android-bridge', {
        requiresUserConfirmation: false,
      });
    }

    const triggered = triggerBrowserLink(validated.telUri, false);
    return makeResult(
      'makeCall',
      triggered,
      triggered
        ? 'Opened device dialer prompt (user confirmation required to place the call).'
        : 'Unable to open phone dialer in this environment.',
      'browser',
      { requiresUserConfirmation: true },
      validated.telUri,
    );
  }

  if (name === 'callContact') {
    const contactName = typeof args.contactName === 'string' ? args.contactName.trim() : '';
    if (!contactName) {
      return makeResult('callContact', false, 'Contact name is required.', 'validation');
    }

    if (!bridge) {
      return makeResult(
        'callContact',
        false,
        `Cannot access device contacts for "${contactName}" from a standard web browser. Ask the user for their phone number or use the Cosmic AI Android app.`,
        'browser',
        { contactName, requiresNativeBridge: true },
      );
    }

    const res = await bridge.callContact(contactName);
    return makeResult('callContact', res.ok, res.message, 'android-bridge', {
      contactName,
      matchCount: res.matches?.length ?? (res.ok ? 1 : 0),
      matchNames: res.matches?.map((m) => m.name),
    });
  }

  if (name === 'findContact') {
    const contactName = typeof args.contactName === 'string' ? args.contactName.trim() : '';
    if (!contactName) {
      return makeResult('findContact', false, 'Contact name is required.', 'validation');
    }

    if (!bridge) {
      return makeResult(
        'findContact',
        false,
        `Device contacts for "${contactName}" are only accessible in the Cosmic AI Android APK. Cannot guess contact phone numbers in a web browser.`,
        'browser',
        { contactName, status: 'requires_native_bridge', requiresNativeBridge: true },
      );
    }

    const res = await bridge.findContact(contactName);
    return makeResult('findContact', res.ok, res.message, 'android-bridge', {
      contactName,
      status: res.status ?? (res.ok ? 'contact_resolved' : 'not_found'),
      matchCount: res.matches?.length ?? 0,
      matchNames: res.matches?.map((m) => m.name) ?? [],
    });
  }

  if (name === 'draftWhatsAppMessage') {
    const contactName = typeof args.contactName === 'string' ? args.contactName.trim() : '';
    const message = typeof args.message === 'string' ? args.message.trim() : '';
    if (!contactName) {
      return makeResult('draftWhatsAppMessage', false, 'Contact name is required.', 'validation');
    }
    if (!message) {
      return makeResult('draftWhatsAppMessage', false, 'Message text is required.', 'validation');
    }

    if (!bridge) {
      return makeResult(
        'draftWhatsAppMessage',
        false,
        `Cannot look up "${contactName}" in device contacts from a standard web browser. Use the Cosmic AI Android APK to resolve contacts and prepare WhatsApp messages safely.`,
        'browser',
        {
          contactName,
          state: 'message_prepared',
          requiresNativeBridge: true,
        },
      );
    }

    const lookup = await bridge.findContact(contactName);
    const matched = lookup.matches && lookup.matches.length === 1 ? lookup.matches[0] : null;
    if (!lookup.ok || !matched) {
      return makeResult('draftWhatsAppMessage', false, lookup.message, 'android-bridge', {
        contactName,
        status: lookup.status ?? 'not_found',
        matchNames: lookup.matches?.map((m) => m.name) ?? [],
      });
    }

    const draft: PendingWhatsAppDraft = {
      id: `wa_${timestamp}`,
      contactName: matched.name,
      phoneNumber: matched.phoneNumber,
      message,
      state: 'message_prepared',
      createdAt: timestamp,
    };

    return makeResult(
      'draftWhatsAppMessage',
      true,
      `Prepared WhatsApp message for "${matched.name}". Ask the user to confirm before opening WhatsApp to send.`,
      'android-bridge',
      {
        draftId: draft.id,
        contactName: matched.name,
        message,
        state: 'message_prepared',
        messagePrepared: true,
        whatsappOpened: false,
        messageSent: false,
        messageDelivered: false,
        requiresUserConfirmation: true,
      },
      undefined,
      { pendingDraft: draft },
    );
  }

  if (name === 'sendWhatsAppMessage') {
    const contactName = typeof args.contactName === 'string' ? args.contactName.trim() : '';
    const message = typeof args.message === 'string' ? args.message.trim() : '';
    const confirmed = args.confirmed === true;

    if (!contactName) {
      return makeResult('sendWhatsAppMessage', false, 'Contact name is required.', 'validation');
    }
    if (!message) {
      return makeResult('sendWhatsAppMessage', false, 'Message text is required.', 'validation');
    }

    if (!bridge) {
      return makeResult(
        'sendWhatsAppMessage',
        false,
        `Cannot resolve "${contactName}" or send WhatsApp messages from a standard web browser. Use the Cosmic AI Android APK.`,
        'browser',
        { contactName, requiresNativeBridge: true },
      );
    }

    const lookup = await bridge.findContact(contactName);
    const matched = lookup.matches && lookup.matches.length === 1 ? lookup.matches[0] : null;
    if (!lookup.ok || !matched) {
      return makeResult('sendWhatsAppMessage', false, lookup.message, 'android-bridge', {
        contactName,
        status: lookup.status ?? 'not_found',
        matchNames: lookup.matches?.map((m) => m.name) ?? [],
      });
    }

    if (!confirmed) {
      const draft: PendingWhatsAppDraft = {
        id: `wa_${timestamp}`,
        contactName: matched.name,
        phoneNumber: matched.phoneNumber,
        message,
        state: 'message_prepared',
        createdAt: timestamp,
      };
      return makeResult(
        'sendWhatsAppMessage',
        false,
        `Confirmation required before opening WhatsApp for "${matched.name}". State: message_prepared.`,
        'validation',
        {
          draftId: draft.id,
          contactName: matched.name,
          message,
          state: 'message_prepared',
          messagePrepared: true,
          whatsappOpened: false,
          messageSent: false,
          messageDelivered: false,
          requiresUserConfirmation: true,
        },
        undefined,
        { pendingDraft: draft },
      );
    }

    const chatRes = await bridge.openWhatsAppChat(matched.phoneNumber, message);
    return makeResult(
      'sendWhatsAppMessage',
      chatRes.ok,
      chatRes.ok
        ? `Opened WhatsApp chat for "${matched.name}" with the prepared message ready to send.`
        : chatRes.message,
      'android-bridge',
      {
        contactName: matched.name,
        state: chatRes.ok ? 'whatsapp_opened' : 'message_prepared',
        messagePrepared: true,
        whatsappOpened: chatRes.ok,
        messageSent: false,
        messageDelivered: false,
      },
      undefined,
      chatRes.ok ? { clearDraft: true } : undefined,
    );
  }

  return makeResult(
    'openApp',
    false,
    `Unsupported tool "${name}" was rejected.`,
    'validation',
  );
}
