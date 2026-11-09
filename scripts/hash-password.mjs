#!/usr/bin/env node
/**
 * Generates the AUTH_PASSWORD_HASH secret (PBKDF2-SHA256, 100k iterations — the Workers maximum).
 *
 *   npm run hash-password              # prompts (input hidden)
 *   npm run hash-password -- --secret  # also prints a fresh SESSION_SECRET
 *
 * The plaintext password is never written anywhere.
 */
import { webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline';

const ITERATIONS = 100_000;
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (s) => {
      if (s.includes(question)) write?.(s);
      else if (s.trim()) write?.('*'.repeat(s.length));
      else write?.(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function hash(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    256,
  );
  return `pbkdf2_sha256:${ITERATIONS}:${b64url(salt)}:${b64url(new Uint8Array(bits))}`;
}

const password = process.env.PASSWORD ?? (await prompt('New password: '));
if (password.length < 10) {
  console.error('Use at least 10 characters.');
  process.exit(1);
}
if (!process.env.PASSWORD) {
  const confirm = await prompt('Repeat password: ');
  if (confirm !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}

console.log('\nAUTH_PASSWORD_HASH=' + (await hash(password)));
if (process.argv.includes('--secret')) {
  console.log('SESSION_SECRET=' + b64url(webcrypto.getRandomValues(new Uint8Array(32))));
}
