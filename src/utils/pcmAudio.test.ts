import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToUint8,
  computeRmsLevel,
  float32ToInt16Pcm,
  int16BytesToFloat32,
  parsePcmMimeType,
  resampleFloat32,
  uint8ToBase64,
} from './pcmAudio.ts';

test('parsePcmMimeType extracts sampleRate, channels, and defaults cleanly', () => {
  assert.deepEqual(parsePcmMimeType('audio/pcm;rate=24000'), {
    sampleRate: 24000,
    channels: 1,
    bitsPerSample: 16,
  });
  assert.deepEqual(parsePcmMimeType('audio/pcm; rate=16000; channels=2'), {
    sampleRate: 16000,
    channels: 2,
    bitsPerSample: 16,
  });
  assert.deepEqual(parsePcmMimeType(undefined), {
    sampleRate: 24000,
    channels: 1,
    bitsPerSample: 16,
  });
});

test('float32 <-> int16 PCM roundtrip preserves signal bounds and polarity', () => {
  const input = new Float32Array([-1.2, -0.5, 0, 0.5, 1.5]);
  const int16 = float32ToInt16Pcm(input);
  assert.equal(int16[0], -32768);
  assert.equal(int16[2], 0);
  assert.equal(int16[4], 32767);

  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  const decoded = int16BytesToFloat32(bytes);
  assert.equal(decoded.length, 5);
  assert.ok(Math.abs(decoded[0] + 1) < 0.001);
  assert.ok(Math.abs(decoded[1] + 0.5) < 0.001);
  assert.equal(decoded[2], 0);
  assert.ok(Math.abs(decoded[3] - 0.5) < 0.001);
  assert.ok(Math.abs(decoded[4] - 1) < 0.001);
});

test('base64 roundtrip preserves raw PCM bytes', () => {
  const bytes = new Uint8Array([0, 127, 128, 255, 42, 99]);
  const b64 = uint8ToBase64(bytes);
  const back = base64ToUint8(b64);
  assert.deepEqual(Array.from(back), Array.from(bytes));
});

test('resampleFloat32 downsamples 48kHz to 16kHz by 3x accurately', () => {
  const input = new Float32Array(480);
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
  }
  const resampled = resampleFloat32(input, 48000, 16000);
  assert.equal(resampled.length, 160);
  const rms = computeRmsLevel(resampled);
  assert.ok(rms > 0.5 && rms <= 1);
});
