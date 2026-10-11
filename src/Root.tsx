import React from 'react';
import { Composition, staticFile } from 'remotion';
import { MainComposition } from './Composition';

const FPS = 30;
const TAIL_SECONDS = 1;      // extra time after the last caption ends
const FALLBACK_SECONDS = 10; // used only if captions.json can't be read

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={FALLBACK_SECONDS * FPS}
        fps={FPS}
        width={1080}
        height={1920}
        calculateMetadata={async () => {
          try {
            const res = await fetch(staticFile('captions.json'));
            const captions: { endMs: number }[] = await res.json();
            const lastEndMs = Math.max(...captions.map((c) => c.endMs));
            return {
              durationInFrames: Math.ceil((lastEndMs / 1000 + TAIL_SECONDS) * FPS),
            };
          } catch (err) {
            console.error('Could not calculate duration from captions.json:', err);
            return { durationInFrames: FALLBACK_SECONDS * FPS };
          }
        }}
      />
    </>
  );
};