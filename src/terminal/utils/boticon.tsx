import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

// Animation frames for the bot
const antennaFrames = {
  center: ['   │ ', ' __│_']
};

const eyeFrames = {
  idle:      ' │▪▪│',
  lookRight: ' │ ▪▪',
  lookLeft:  ' ▪▪ │',
  closed:    ' │--│  ',
};

const bottomFrame = ' └──┘';

type AntennaState = 'center';
type EyeState = 'idle' | 'lookRight' | 'lookLeft' | 'closed';

const antennaStates: AntennaState[] = ['center'];
const eyeStates: EyeState[] = ['idle', 'lookRight', 'lookLeft'];

// Helper to pick random item from array
const randomPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Random duration between min and max
const randomDuration = (min: number, max: number) => Math.floor(Math.random() * (max - min) + min);

interface BotIconProps {
  color?: string;
  animate?: boolean;
}

export const BotIcon: React.FC<BotIconProps> = ({ color = 'cyan', animate = true }) => {
  const [antenna, setAntenna] = useState<AntennaState>('center');
  const [eyes, setEyes] = useState<EyeState>('idle');

  useEffect(() => {
    if (!animate) return;

    // Blink occasionally (random interval 4-8 seconds)
    const blinkInterval = setInterval(() => {
      if (Math.random() < 0.5) { // 50% chance to blink
        setEyes('closed');
        
        // 50% slow blink (hold), 50% fast blink
        if (Math.random() < 0.5) {
          // Slow blink: close, hold, open
          setTimeout(() => setEyes('idle'), randomDuration(400, 700));
        } else {
          // Fast blink: quick close and open
          setTimeout(() => setEyes('idle'), 100);
        }
      }
    }, randomDuration(4000, 8000));

    // Random eye movement (every 3-6 seconds)
    const eyeInterval = setInterval(() => {
      if (Math.random() < 0.5) { // 50% chance to look around
        const newEyeState = randomPick(eyeStates);
        setEyes(newEyeState);
        // Return to idle after holding for a bit (1-2 seconds)
        if (newEyeState !== 'idle') {
          setTimeout(() => setEyes('idle'), randomDuration(1000, 2000));
        }
      }
    }, randomDuration(3000, 6000));

    return () => {
      clearInterval(blinkInterval);
      clearInterval(eyeInterval);
    };
  }, [animate]);

  const antennaFrame = antennaFrames[antenna];
  const eyeFrame = eyeFrames[eyes];

  return (
    <Box flexDirection="column">
      <Text color={color}>{antennaFrame[0]}</Text>
      <Text color={color}>{antennaFrame[1]}</Text>
      <Text color={color}>{eyeFrame}</Text>
      <Text color={color}>{bottomFrame}</Text>
    </Box>
  );
};

// Static version for when animation is not needed
export const BotIconStatic: React.FC<{ color?: string }> = ({ color = 'cyan' }) => {
  return (
    <Box flexDirection="column">
      <Text color={color}>   | </Text>
      <Text color={color}> __|_</Text>
      <Text color={color}> │▪▪│</Text>
      <Text color={color}> └──┘</Text>
    </Box>
  );
};
