import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

export const MainComposition = () => {
  const frame = useCurrentFrame();
  const fps = 30;
  const currentTimeMs = (frame / fps) * 1000;

  const [captions, setCaptions] = useState<Caption[]>([]);

  useEffect(() => {
    fetch(staticFile('captions.json'))
      .then((res) => res.json())
      .then((data) => setCaptions(data))
      .catch((err) => console.error('Error loading captions:', err));
  }, []);

  const currentCaption = captions.find(
    (c) => currentTimeMs >= c.startMs && currentTimeMs <= c.endMs
  );

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
      <Audio src={staticFile('audio.wav')} />
      {currentCaption && (
        <div
          style={{
            fontSize: 64,
            fontWeight: 'bold',
            color: '#FFD700',
            textShadow: '3px 3px 0px #000, -3px -3px 0px #000, 3px -3px 0px #000, -3px 3px 0px #000',
            textAlign: 'center',
            padding: '0 40px',
          }}
        >
          {currentCaption.text}
        </div>
      )}
    </AbsoluteFill>
  );
};