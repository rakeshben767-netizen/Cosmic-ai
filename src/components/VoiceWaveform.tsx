import { useEffect, useRef } from 'react';
import type { CosmicMode, CosmicState } from '../types/cosmic.ts';

interface VoiceWaveformProps {
  mode: CosmicMode;
  cosmicState: CosmicState;
  audioLevelRef: React.MutableRefObject<number>;
}

const BAR_WEIGHTS = [0.35, 0.55, 0.78, 0.95, 0.72, 1.0, 0.88, 0.98, 0.68, 0.84, 0.62, 0.4];

export function VoiceWaveform({ mode, cosmicState, audioLevelRef }: VoiceWaveformProps) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    let rafId = 0;
    let phase = 0;

    const updateBars = () => {
      phase += 0.14;
      const level = audioLevelRef.current || 0;
      const isSpeaking = cosmicState === 'SPEAKING';
      const isListening = cosmicState === 'LISTENING';
      const isConnecting =
        cosmicState === 'CONNECTING' || cosmicState === 'RECONNECTING';

      for (let i = 0; i < BAR_WEIGHTS.length; i++) {
        const el = barsRef.current[i];
        if (!el) continue;

        let scale = 0.18;
        if (isSpeaking) {
          const wave = 0.45 + 0.55 * Math.abs(Math.sin(phase * 1.45 + i * 0.65));
          scale = Math.min(1, 0.24 + (level * 0.85 + 0.25) * BAR_WEIGHTS[i] * wave);
        } else if (isListening) {
          const idleWave = 0.3 + 0.25 * Math.sin(phase * 0.75 + i * 0.5);
          scale = Math.min(1, 0.18 + Math.max(level * 0.9, idleWave * 0.4) * BAR_WEIGHTS[i]);
        } else if (isConnecting) {
          scale = 0.22 + 0.35 * Math.abs(Math.sin(phase * 1.1 + i * 0.45));
        }

        el.style.transform = `scaleY(${scale.toFixed(3)})`;
      }

      rafId = requestAnimationFrame(updateBars);
    };

    rafId = requestAnimationFrame(updateBars);
    return () => cancelAnimationFrame(rafId);
  }, [audioLevelRef, cosmicState]);

  const barColorClass =
    cosmicState === 'ERROR'
      ? 'bg-red-400'
      : cosmicState === 'RECONNECTING'
        ? 'bg-amber-400'
        : mode === 'badmash'
          ? cosmicState === 'SPEAKING'
            ? 'bg-fuchsia-400'
            : 'bg-purple-400'
          : 'bg-sky-400';

  return (
    <div
      className="flex h-7 items-center justify-center gap-1 px-2"
      aria-hidden="true"
      data-testid="voice-waveform"
    >
      {BAR_WEIGHTS.map((_, idx) => (
        <span
          key={idx}
          ref={(el) => {
            barsRef.current[idx] = el;
          }}
          className={`h-6 w-1 origin-center rounded-sm transition-colors duration-150 ${barColorClass}`}
          style={{ transform: 'scaleY(0.18)' }}
        />
      ))}
    </div>
  );
}
