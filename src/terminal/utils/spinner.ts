// Simple spinner that doesn't conflict with Ink's stdin
const frames = ['L', '𝙹', 'ᔑ', '↸', '╎', 'リ', '⊣', ' ', 'ℸ', ' ', '⍑', 'ᒷ', ' ', 'リ', 'ᒷ', '⚍', '∷', 'ᔑ', 'ꖎ', ' ', '╎', 'リ', 'ℸ', ' ', 'ᒷ', '∷', '⎓', 'ᔑ', 'ᓵ', 'ᒷ', ',', ' ', '𝙹', '!', '¡', 'ᒷ', 'リ', '╎', 'リ', '⊣', ' ', 'ᓭ', 'ᒷ', 'ᓭ', 'ᔑ', 'ᒲ', 'ᒷ', ',', ' ', '!', '¡', '⚍', 'ꖎ', 'ᓭ', 'ᔑ', 'ℸ', ' ', '⍑', 'ᒷ', ' ', 'ʖ', '𝙹', 'ℸ', ' ', ' ', 'ᒲ', 'ᔑ', 'ℸ', ' ', '∷', '╎', ' ', '̇', '/'];
const dots = ['', '.', '..', '...'];
const blue = '\x1b[34m';
const reset = '\x1b[0m';

export const spinner = () => {
  let interval: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;
  let dotIndex = 0;
  let currentMessage = '';
  let hasStarted = false;

  return {
    start: (message: string) => {
      // If already running, stop and step down
      if (interval) {
        clearInterval(interval);
        interval = null;
        process.stdout.write(`\r\x1b[K${blue}◇${reset} ${currentMessage}\n`);
        process.stdout.write('│\n');
      } else if (hasStarted) {
        // Previous spinner was stopped, still step down
        process.stdout.write('│\n');
      }
      
      hasStarted = true;
      currentMessage = message;
      frameIndex = 0;
      dotIndex = 0;
      process.stdout.write(`${frames[frameIndex]} ${message}`);
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        dotIndex = (dotIndex + 1) % dots.length;
        process.stdout.write(`\r\x1b[K${frames[frameIndex]} ${currentMessage}${dots[dotIndex]}`);
      }, 80);
    },
    message: (message: string) => {
      currentMessage = message;
      if (interval) {
        process.stdout.write(`\r\x1b[K${frames[frameIndex]} ${message}${dots[dotIndex]}`);
      }
    },
    stop: (message?: string) => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (message) {
        process.stdout.write(`\r\x1b[K${blue}◇${reset} ${message}\n`);
      } else {
        process.stdout.write('\r\x1b[K'); // Clear line
      }
    }
  };
};
