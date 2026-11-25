import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildYouTubeSearchUrl,
  executeSafeToolCall,
  resolveAppTarget,
  sanitizeActionArgsForLog,
  validatePhoneNumber,
  validateSafeUrl,
} from './safeActions.ts';
import type { CosmicNativeBridge } from './androidBridge.ts';

function createMockBridge(overrides: Partial<CosmicNativeBridge> = {}): CosmicNativeBridge {
  return {
    async openWhatsApp() {
      return { ok: true, message: 'WhatsApp launched via Android Intent.' };
    },
    async openApp(appName) {
      return { ok: true, message: `${appName} launched.` };
    },
    async openYouTubeSearch(query) {
      return {
        ok: true,
        message: `Opened YouTube app search for "${query}".`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        target: 'youtube_app',
      };
    },
    async openUrl(url) {
      return { ok: true, message: `Opened ${url}.` };
    },
    async makeCall(phoneNumber) {
      return { ok: true, message: `Dialing ${phoneNumber}.` };
    },
    async callContact(contactName) {
      return { ok: true, message: `Found 1 match for ${contactName}: +919876543210` };
    },
    async findContact(contactName) {
      if (contactName.toLowerCase() === 'papa') {
        return {
          ok: true,
          status: 'contact_resolved',
          message: "Found contact 'Papa'.",
          matches: [{ name: 'Papa', phoneNumber: '+919876543210' }],
        };
      }
      if (contactName.toLowerCase() === 'rahul') {
        return {
          ok: false,
          status: 'multiple_matches',
          message: "Multiple contacts matched 'Rahul'. Ask the user which one they mean.",
          matches: [
            { name: 'Rahul Sharma', phoneNumber: '+919811111111' },
            { name: 'Rahul Verma', phoneNumber: '+919822222222' },
          ],
        };
      }
      return {
        ok: false,
        status: 'not_found',
        message: `No contact found matching '${contactName}'.`,
        matches: [],
      };
    },
    async openWhatsAppChat() {
      return {
        ok: true,
        state: 'whatsapp_opened',
        message: 'Opened WhatsApp chat with prepared message ready to send.',
      };
    },
    ...overrides,
  };
}

test('resolveAppTarget matches allowlisted apps including Google and rejects arbitrary package names', () => {
  const yt = resolveAppTarget('youtube');
  assert.equal(yt.allowed, true);
  if (yt.allowed) assert.equal(yt.app.displayName, 'YouTube');

  const google = resolveAppTarget('Google');
  assert.equal(google.allowed, true);
  if (google.allowed) assert.equal(google.app.displayName, 'Google');

  const wa = resolveAppTarget('WhatsApp');
  assert.equal(wa.allowed, true);

  const arbitraryPkg = resolveAppTarget('com.malicious.backdoor');
  assert.equal(arbitraryPkg.allowed, false);

  const unknownApp = resolveAppTarget('RandomUnlistedApp');
  assert.equal(unknownApp.allowed, false);
});

test('buildYouTubeSearchUrl properly validates and URL-encodes search queries', () => {
  const res = buildYouTubeSearchUrl('  Free Fire   gameplay\n');
  assert.equal(res.valid, true);
  if (res.valid) {
    assert.equal(res.query, 'Free Fire gameplay');
    assert.equal(res.url, 'https://www.youtube.com/results?search_query=Free%20Fire%20gameplay');
  }

  assert.equal(buildYouTubeSearchUrl('').valid, false);
  assert.equal(buildYouTubeSearchUrl('   ').valid, false);
  assert.equal(buildYouTubeSearchUrl('a'.repeat(161)).valid, false);
});

test('validateSafeUrl prefers HTTPS and blocks javascript/data/file schemes', () => {
  const httpsRes = validateSafeUrl('https://wikipedia.org/wiki/Mumbai');
  assert.equal(httpsRes.valid, true);

  const upgradeHttp = validateSafeUrl('http://example.com/test');
  assert.equal(upgradeHttp.valid, true);
  if (upgradeHttp.valid) assert.ok(upgradeHttp.url.startsWith('https://'));

  assert.equal(validateSafeUrl('javascript:alert(1)').valid, false);
  assert.equal(validateSafeUrl('data:text/html,<script>').valid, false);
  assert.equal(validateSafeUrl('intent://scan/#Intent').valid, false);
  assert.equal(validateSafeUrl('file:///etc/passwd').valid, false);
});

test('validatePhoneNumber accepts valid numbers and rejects invalid strings', () => {
  const ok1 = validatePhoneNumber('+91 98765-43210');
  assert.equal(ok1.valid, true);
  if (ok1.valid) assert.equal(ok1.normalized, '+919876543210');

  assert.equal(validatePhoneNumber('123').valid, false);
  assert.equal(validatePhoneNumber('98765abcde').valid, false);
  assert.equal(validatePhoneNumber('*#06#').valid, false);
});

test('executeSafeToolCall executes openYouTubeSearch cleanly via bridge and validates query', async () => {
  const bridge = createMockBridge();
  const okRes = await executeSafeToolCall(
    'openYouTubeSearch',
    { query: 'Free Fire gameplay' },
    bridge,
  );
  assert.equal(okRes.logEntry.ok, true);
  assert.equal(
    okRes.response.url,
    'https://www.youtube.com/results?search_query=Free%20Fire%20gameplay',
  );

  const badRes = await executeSafeToolCall('openYouTubeSearch', { query: '   ' }, bridge);
  assert.equal(badRes.logEntry.ok, false);
});

test('WhatsApp contact resolution and confirmation state machine enforce prepared vs opened states', async () => {
  const bridge = createMockBridge();

  // Ambiguous contact -> fails honestly asking which contact
  const multiRes = await executeSafeToolCall('findContact', { contactName: 'Rahul' }, bridge);
  assert.equal(multiRes.logEntry.ok, false);
  assert.equal(multiRes.response.status, 'multiple_matches');

  // Missing contact -> never guesses
  const missingRes = await executeSafeToolCall(
    'draftWhatsAppMessage',
    { contactName: 'UnknownGuy', message: 'Hi' },
    bridge,
  );
  assert.equal(missingRes.logEntry.ok, false);
  assert.equal(missingRes.pendingDraft, undefined);

  // Single match -> prepares message draft requiring confirmation
  const draftRes = await executeSafeToolCall(
    'draftWhatsAppMessage',
    { contactName: 'Papa', message: 'main ghar aa raha hoon' },
    bridge,
  );
  assert.equal(draftRes.logEntry.ok, true);
  assert.equal(draftRes.response.state, 'message_prepared');
  assert.equal(draftRes.response.requiresUserConfirmation, true);
  assert.equal(draftRes.response.whatsappOpened, false);
  assert.equal(draftRes.response.messageDelivered, false);
  assert.ok(draftRes.pendingDraft);
  assert.equal(draftRes.pendingDraft?.contactName, 'Papa');

  // Unconfirmed sendWhatsAppMessage -> refuses to send and prepares confirmation
  const unconfirmedRes = await executeSafeToolCall(
    'sendWhatsAppMessage',
    { contactName: 'Papa', message: 'main ghar aa raha hoon', confirmed: false },
    bridge,
  );
  assert.equal(unconfirmedRes.logEntry.ok, false);
  assert.equal(unconfirmedRes.response.state, 'message_prepared');
  assert.equal(unconfirmedRes.response.whatsappOpened, false);

  // Confirmed sendWhatsAppMessage -> opens WhatsApp honestly (not falsely claiming delivered)
  const confirmedRes = await executeSafeToolCall(
    'sendWhatsAppMessage',
    { contactName: 'Papa', message: 'main ghar aa raha hoon', confirmed: true },
    bridge,
  );
  assert.equal(confirmedRes.logEntry.ok, true);
  assert.equal(confirmedRes.response.state, 'whatsapp_opened');
  assert.equal(confirmedRes.response.whatsappOpened, true);
  assert.equal(confirmedRes.response.messageDelivered, false);
  assert.equal(confirmedRes.clearDraft, true);
});

test('sanitizeActionArgsForLog redacts sensitive phone numbers and WhatsApp messages', () => {
  const sanitized = sanitizeActionArgsForLog('sendWhatsAppMessage', {
    contactName: 'Papa',
    phoneNumber: '+919876543210',
    message: 'Secret private message text',
    confirmed: true,
  });
  assert.equal(sanitized.contactName, 'Papa');
  assert.equal(sanitized.phoneNumber, '[redacted]');
  assert.match(String(sanitized.message), /^\[redacted len=27\]$/);
});

test('executeSafeToolCall routes callContact honestly without bridge and delegates when bridge exists', async () => {
  const noBridgeRes = await executeSafeToolCall('callContact', { contactName: 'Mom' }, null);
  assert.equal(noBridgeRes.logEntry.ok, false);
  assert.match(noBridgeRes.logEntry.message, /web browser/i);

  const withBridge = await executeSafeToolCall(
    'callContact',
    { contactName: 'Mom' },
    createMockBridge(),
  );
  assert.equal(withBridge.logEntry.ok, true);
  assert.equal(withBridge.logEntry.via, 'android-bridge');
});
