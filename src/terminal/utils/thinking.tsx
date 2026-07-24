import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

// Animation frames for the bot
const antennaFrames = {
  center: ['  │ ', '__│_']
};

const eyeFrames = {
  idle:      '│▪▪│',
  lookRight: '│ ▪▪',
  lookLeft:  '▪▪ │',
  closed:    '│--│',
};

const bottomFrame = '└──┘';

// Japanese character spinner - minimal strokes for clean animation

const thickLines = ['┃┃┃', '║║║', '│││', '┃║┃', '║┃║', '│┃│', '┃│┃', '║│║', '│║│', '┃┃║'];
const braillePatterns = ['⠇', '⠕', '⠁', '⠙', '⠊', '⠝', '⠛', ' ', '⠝', '⠑', '⠥', '⠗', '⠕', '⠇', ' ', '⠊', '⠝', '⠞', '⠑', '⠗', '⠋', '⠁', '⠉', '⠑', ',', ' ', '⠕', '⠏', '⠑', '⠝', '⠊', '⠝', '⠛', ' ', '⠎', '⠑', '⠎', '⠁', '⠍', '⠑', ',', ' ', '⠃', '⠕', '⠞', ' ', '⠍', '⠁', '⠞', '⠗', '⠊', '⠭', ' ', '⠕', '⠏', '⠑', '⠗', '⠁', '⠞', '⠊', '⠝', '⠛'];
const galacticCode = ['L', '𝙹', 'ᔑ', '↸', '╎', 'リ', '⊣', ' ', 'ℸ', ' ', '⍑', 'ᒷ', ' ', 'リ', 'ᒷ', '⚍', '∷', 'ᔑ', 'ꖎ', ' ', '╎', 'リ', 'ℸ', ' ', 'ᒷ', '∷', '⎓', 'ᔑ', 'ᓵ', 'ᒷ', ',', ' ', '𝙹', '!', '¡', 'ᒷ', 'リ', '╎', 'リ', '⊣', ' ', 'ᓭ', 'ᒷ', 'ᓭ', 'ᔑ', 'ᒲ', 'ᒷ', ',', ' ', '!', '¡', '⚍', 'ꖎ', 'ᓭ', 'ᔑ', 'ℸ', ' ', '⍑', 'ᒷ', ' ', 'ʖ', '𝙹', 'ℸ', ' ', ' ', 'ᒲ', 'ᔑ', 'ℸ', ' ', '∷', '╎', ' ', '̇', '/'];
const japaneseFrames = ['ニ', 'ュ', 'ー', 'ロ', 'イ', 'ン', 'タ', 'ー', 'フ', 'ェ', 'ー', 'ス', 'を', 'ロ', 'ー', 'ド', 'し', '、', '開', 'け', 'ゴ', 'マ', '、', 'ボ', 'ッ', 'ト', 'マ', 'ト', 'リ', 'ッ', 'ク', 'ス', 'を', '動', '作', '中'];

type EyeState = 'idle' | 'lookRight' | 'lookLeft' | 'closed';
const eyeStates: EyeState[] = ['idle', 'lookRight', 'lookLeft'];

const randomPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomDuration = (min: number, max: number) => Math.floor(Math.random() * (max - min) + min);

interface ThinkingAnimationProps {
  state?: string;
  subState?: string;
  isThinking?: boolean
}

export const ThinkingAnimation: React.FC<ThinkingAnimationProps> = ({
  state,
  subState,
  isThinking,
}) => {
  const [eyes, setEyes] = useState<EyeState>('idle');
  const [glyphIndex, setGlyphIndex] = useState(0);
  const [glyphSet, setGlyphSet] = useState<'galactic' | 'japanese' | 'thick' | 'braille'>(
    Math.random() < 0.25 ? 'galactic' : 
    Math.random() < 0.33 ? 'japanese' : 
    Math.random() < 0.5 ? 'thick' : 'braille'
  );

  useEffect(() => {
    // Blink occasionally (random interval 4-8 seconds)
  if (!isThinking) {
      setEyes('idle');
      setGlyphIndex(0);
      return;
    }


    const blinkInterval = setInterval(() => {
      if (Math.random() < 0.5) {
        setEyes('closed');
        if (Math.random() < 0.5) {
          setTimeout(() => setEyes('idle'), randomDuration(400, 700));
        } else {
          setTimeout(() => setEyes('idle'), 100);
        }
      }
    }, randomDuration(4000, 8000));

    // Random eye movement (every 3-6 seconds)
    const eyeInterval = setInterval(() => {
      if (Math.random() < 0.5) {
        const newEyeState = randomPick(eyeStates);
        setEyes(newEyeState);
        if (newEyeState !== 'idle') {
          setTimeout(() => setEyes('idle'), randomDuration(1000, 2000));
        }
      }
    }, randomDuration(3000, 6000));

    // Glyph spinner - rapid cycling for alien decryption effect
    const glyphInterval = setInterval(() => {
      const currentFrames = 
        glyphSet === 'galactic' ? galacticCode : 
        glyphSet === 'japanese' ? japaneseFrames : 
        glyphSet === 'thick' ? thickLines : 
        braillePatterns;
      setGlyphIndex((prev) => (prev + 1) % currentFrames.length);
    }, 120);

    // Randomly switch between glyph sets every 5-10 seconds
    const switchInterval = setInterval(() => {
      const random = Math.random();
      const newSet = 
        random < 0.25 ? 'galactic' : 
        random < 0.5 ? 'japanese' : 
        random < 0.75 ? 'thick' : 'braille';
      setGlyphSet(newSet);
      setGlyphIndex(0);
    }, randomDuration(5000, 10000));

    return () => {
      clearInterval(blinkInterval);
      clearInterval(eyeInterval);
      clearInterval(glyphInterval);
      clearInterval(switchInterval);
    };
  }, [isThinking]);

  const antennaFrame = antennaFrames.center;
  const eyeFrame = eyeFrames[eyes];
  const currentFrames = 
    glyphSet === 'galactic' ? galacticCode : 
    glyphSet === 'japanese' ? japaneseFrames : 
    glyphSet === 'thick' ? thickLines : 
    braillePatterns;
  const currentGlyph = currentFrames[glyphIndex];

  return (
    <Box flexDirection="column">
      <Text color="cyan"> {antennaFrame[0]}</Text>
      <Text color="cyan"> {antennaFrame[1]}</Text>
      <Text>
        <Text color="cyan"> {eyeFrame}</Text>
        <Text bold color="cyan"> {currentGlyph} {state || "Idling..."}  </Text>
      </Text>
      <Text>
        <Text color="cyan"> {bottomFrame}</Text>
        {subState && <Text color={"cyan"}>{" └── " + subState }</Text>}
      </Text>
    </Box>
  );
};
