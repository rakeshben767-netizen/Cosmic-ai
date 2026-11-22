import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeSafeToolCall,
  resolveAppTarget,
  validatePhoneNumber,
  validateSafeUrl,
} from './safeActions.ts';
import type { CosmicNativeBridge } from './androidBridge.ts';

test('resolveAppTarget matches allowlisted apps and rejects arbitrary package names', () => {
  const yt = resolveAppTarget('youtube');
  assert.equal(yt.allowed, true);
  if (yt.allowed) assert.equal(yt.app.displayName, 'YouTube');

  const wa = resolveAppTarget('WhatsApp');
  assert.equal(wa.allowed, true);

  const arbitraryPkg = resolveAppTarget('com.malicious.backdoor');
  assert.equal(arbitraryPkg.allowed, false);

  const unknownApp = resolveAppTarget('RandomUnlistedApp');
  assert.equal(unknownApp.allowed, false);
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

test('executeSafeToolCall routes callContact honestly without bridge and delegates when bridge exists', async () => {
  const noBridgeRes = await executeSafeToolCall('callContact', { contactName: 'Mom' }, null);
  assert.equal(noBridgeRes.logEntry.ok, false);
  assert.match(noBridgeRes.logEntry.message, /web browser/i);

  const mockBridge: CosmicNativeBridge = {
    async openWhatsApp() {
      return { ok: true, message: 'WhatsApp launched via Android Intent.' };
    },
    async openApp(appName) {
      return { ok: true, message: `${appName} launched.` };
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
  };

  const withBridge = await executeSafeToolCall('callContact', { contactName: 'Mom' }, mockBridge);
  assert.equal(withBridge.logEntry.ok, true);
  assert.equal(withBridge.logEntry.via, 'android-bridge');
});
