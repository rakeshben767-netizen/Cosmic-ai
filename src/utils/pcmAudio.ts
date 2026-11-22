export interface PcmFormatInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export function parsePcmMimeType(mimeType?: string | null): PcmFormatInfo {
  const defaults: PcmFormatInfo = {
    sampleRate: 24000,
    channels: 1,
    bitsPerSample: 16,
  };
  if (!mimeType || typeof mimeType !== 'string') {
    return defaults;
  }

  const rateMatch = mimeType.match(/rate=(\d+)/i);
  const channelsMatch = mimeType.match(/channels=(\d+)/i);
  const bitsMatch = mimeType.match(/pcm[_-]?(\d+)/i);

  const parsedRate = rateMatch ? Number.parseInt(rateMatch[1], 10) : defaults.sampleRate;
  const parsedChannels = channelsMatch
    ? Number.parseInt(channelsMatch[1], 10)
    : defaults.channels;
  const parsedBits = bitsMatch ? Number.parseInt(bitsMatch[1], 10) : defaults.bitsPerSample;

  return {
    sampleRate: Number.isFinite(parsedRate) && parsedRate >= 8000 && parsedRate <= 192000
      ? parsedRate
      : defaults.sampleRate,
    channels: Number.isFinite(parsedChannels) && parsedChannels >= 1 && parsedChannels <= 2
      ? parsedChannels
      : defaults.channels,
    bitsPerSample: parsedBits === 16 ? 16 : 16,
  };
}

export function resampleFloat32(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (input.length === 0) {
    return new Float32Array(0);
  }
  if (sourceRate <= 0 || targetRate <= 0 || sourceRate === targetRate) {
    return input;
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  if (ratio > 1) {
    // Downsampling with simple box averaging over the source window to prevent aliasing
    for (let i = 0; i < outputLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += input[j];
      }
      output[i] = sum / (end - start);
    }
  } else {
    // Upsampling with linear interpolation
    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * ratio;
      const idx0 = Math.floor(srcPos);
      const idx1 = Math.min(input.length - 1, idx0 + 1);
      const frac = srcPos - idx0;
      output[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }
  }

  return output;
}

export function float32ToInt16Pcm(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return int16;
}

export function int16BytesToFloat32(bytes: Uint8Array): Float32Array {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (sampleCount === 0) {
    return new Float32Array(0);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return Math.min(1, rms * 3.2);
}
