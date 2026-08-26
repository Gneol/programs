import { obfuscate } from 'javascript-obfuscator';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, copyFileSync } from 'fs';
import path from 'path';

const OUT_DIR = 'dist';
const TRANSPILED_FILE = path.join(OUT_DIR, '_transpiled.js');
const OBFUSCATED_FILE = path.join(OUT_DIR, '_obfuscated.js');
const BINARY_OUT = '/Users/elijah/Desktop/ttcv2/gneol-release/bin/gneol-linux';
const TARGET = 'bun-linux-x64';

console.log('=== Step 1: Building TypeScript with Bun bundler ===');
try {
  execSync(
    `bun build ./src/index.ts --outfile ${TRANSPILED_FILE} --target bun --format esm`,
    { stdio: 'inherit', cwd: process.cwd() }
  );
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}

console.log('\\n=== Step 2: Obfuscating bundled output ===');
const sourceCode = readFileSync(TRANSPILED_FILE, 'utf-8');
console.log(`Source size: ${(sourceCode.length / 1024 / 1024).toFixed(2)} MB`);

const obfuscationResult = obfuscate(sourceCode, {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  stringArray: true,
  stringArrayThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayShuffle: true,
  splitStrings: false,
  renameGlobals: false,
  renameProperties: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  transformObjectKeys: false,
  numbersToExpressions: true,
  simplify: false,
});

const obfuscatedCode = obfuscationResult.getObfuscatedCode();
console.log(`Obfuscated size: ${(obfuscatedCode.length / 1024 / 1024).toFixed(2)} MB`);
writeFileSync(OBFUSCATED_FILE, obfuscatedCode, 'utf-8');

console.log('\\n=== Step 3: Compiling to Linux binary ===');
try {
  execSync(
    `bun build --compile ${OBFUSCATED_FILE} --outfile ${BINARY_OUT} --target ${TARGET}`,
    { stdio: 'inherit', cwd: process.cwd() }
  );
} catch (err) {
  console.error('Compilation failed:', err.message);
  // Clean up temp files
  if (existsSync(TRANSPILED_FILE)) unlinkSync(TRANSPILED_FILE);
  if (existsSync(OBFUSCATED_FILE)) unlinkSync(OBFUSCATED_FILE);
  process.exit(1);
}

console.log('\\n=== Step 4: Copying Prisma engine alongside binary ===');
const engineSrc = path.join(process.cwd(), 'node_modules', '.prisma', 'client', 'libquery_engine-debian-openssl-3.0.x.so.node');
const engineDest = path.join(path.dirname(BINARY_OUT), 'libquery_engine-debian-openssl-3.0.x.so.node');
if (existsSync(engineSrc)) {
  copyFileSync(engineSrc, engineDest);
  console.log(`Engine copied to: ${engineDest}`);
} else {
  console.warn('Prisma engine not found at:', engineSrc);
}

console.log('\\n=== Step 5: Cleaning up temp files ===');
if (existsSync(TRANSPILED_FILE)) unlinkSync(TRANSPILED_FILE);
if (existsSync(OBFUSCATED_FILE)) unlinkSync(OBFUSCATED_FILE);

console.log(`\\n=== Build Complete! Linux binary at: ${BINARY_OUT} ===`);
