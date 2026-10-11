import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

interface CaptionStyle {
  primaryColor: string;
  fontFamily: string;
  fontSize: number;
  captionPosition: 'top' | 'center' | 'bottom';
}

const DEFAULT_STYLE: CaptionStyle = {
  primaryColor: '#ffffff',
  fontFamily: 'Inter',
  fontSize: 64,
  captionPosition: 'bottom',
};

// Thick black outline around text (8 directions)
const OUTLINE = [
  [4, 0], [-4, 0], [0, 4], [0, -4],
  [3, 3], [-3, -3], [3, -3], [-3, 3],
]
  .map(([x, y]) => `${x}px ${y}px 0 #000`)
  .join(', ');

// ---------------------------------------------------------------
// A simple cartoon character: bobs, blinks, and flaps its mouth
// while speaking. (Placeholder until AI-generated images are added.)
// ---------------------------------------------------------------
const Character: React.FC<{
  color: string;
  speaking: boolean;
  frame: number;
  seed: number;
}> = ({ color, speaking, frame, seed }) => {
  const mouthOpen = speaking
    ? 0.25 + 0.75 * Math.abs(Math.sin(frame * 0.7 + seed))
    : 0.05;
  const mouthRy = 6 + 42 * mouthOpen;

  const blinking = (frame + seed * 20) % 90 < 5;
  const eyeRy = blinking ? 2 : 18;

  const bob = speaking ? Math.sin(frame * 0.35) * 10 : Math.sin(frame * 0.08 + seed) * 3;
  const scale = speaking ? 1.08 : 0.95;

  return (
    <svg
      viewBox="0 0 300 300"
      width={440}
      height={440}
      style={{
        transform: `translateY(${bob}px) scale(${scale})`,
        opacity: speaking ? 1 : 0.7,
      }}
    >
      <circle cx={150} cy={150} r={120} fill={color} stroke="#000" strokeWidth={6} />
      <ellipse cx={105} cy={120} rx={22} ry={eyeRy} fill="#fff" stroke="#000" strokeWidth={4} />
      <ellipse cx={195} cy={120} rx={22} ry={eyeRy} fill="#fff" stroke="#000" strokeWidth={4} />
      {!blinking && (
        <>
          <circle cx={108} cy={122} r={8} fill="#000" />
          <circle cx={192} cy={122} r={8} fill="#000" />
        </>
      )}
      <line x1={80} y1={85} x2={130} y2={speaking ? 78 : 85} stroke="#000" strokeWidth={6} strokeLinecap="round" />
      <line x1={170} y1={speaking ? 78 : 85} x2={220} y2={85} stroke="#000" strokeWidth={6} strokeLinecap="round" />
      <ellipse cx={150} cy={205} rx={38} ry={mouthRy} fill="#5a1a1a" stroke="#000" strokeWidth={5} />
    </svg>
  );
};

export const MainComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  const [captions, setCaptions] = useState<Caption[]>([]);
  const [style, setStyle] = useState<CaptionStyle>(DEFAULT_STYLE);

  // delayRender makes Remotion wait until captions and style have loaded
  const [handle] = useState(() => delayRender('Loading captions.json and style.json'));

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetch(staticFile('captions.json')).then((r) => r.json());
        setCaptions(data);
      } catch (err) {
        console.error('Error loading captions:', err);
      }
      try {
        const s = await fetch(staticFile('style.json')).then((r) => r.json());
        setStyle({ ...DEFAULT_STYLE, ...s });
      } catch (err) {
        console.warn('No style.json found, using defaults.', err);
      }
      continueRender(handle);
    };
    load();
  }, [handle]);

  // Characters take turns per sentence
  const sentenceIndexes = useMemo(() => {
    let sentence = 0;
    return captions.map((c) => {
      const idx = sentence;
      if (/[.!?]["')\]]*\s*$/.test(c.text.trim())) sentence += 1;
      return idx;
    });
  }, [captions]);

  const currentIdx = captions.findIndex(
    (c) => currentTimeMs >= c.startMs && currentTimeMs <= c.endMs
  );
  const currentCaption = currentIdx >= 0 ? captions[currentIdx] : undefined;
  const speakingCharacter = currentIdx >= 0 ? sentenceIndexes[currentIdx] % 2 : -1;

  const positionStyle: React.CSSProperties =
    style.captionPosition === 'top'
      ? { top: 220 }
      : style.captionPosition === 'center'
      ? { top: '50%', transform: 'translateY(-50%)' }
      : { bottom: 380 };

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 50%, #0f172a 100%)',
        alignItems: 'center',
      }}
    >
      <Audio src={staticFile('audio.wav')} />

      <div
        style={{
          position: 'absolute',
          top: 380,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <Character color="#fbbf24" speaking={speakingCharacter === 0} frame={frame} seed={0} />
        <Character color="#34d399" speaking={speakingCharacter === 1} frame={frame} seed={2} />
      </div>

      {currentCaption && (
        <div
          style={{
            position: 'absolute',
            width: '100%',
            fontFamily: `'${style.fontFamily}', Arial, sans-serif`,
            fontSize: style.fontSize,
            fontWeight: 900,
            color: style.primaryColor,
            textShadow: OUTLINE,
            textAlign: 'center',
            padding: '0 40px',
            boxSizing: 'border-box',
            ...positionStyle,
          }}
        >
          {currentCaption.text}
        </div>
      )}
    </AbsoluteFill>
  );
};