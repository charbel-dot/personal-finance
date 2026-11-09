import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs the real stack: production build + Pages Functions + simulated local R2,
 * with throwaway e2e-only credentials (never used anywhere else) and an isolated
 * state directory that is wiped on each run.
 */
export const E2E_USER = 'e2e';
export const E2E_PASSWORD = 'e2e-test-password';
const E2E_HASH = 'pbkdf2_sha256:100000:cme4KtLr7BgNaUmE6HqTJQ:3oTfwmUftg--xCExttgtuS0wI7gOVh9N21RJfS6ouus';
const E2E_SECRET = 'e2e-only-session-secret-0123456789abcdef';
const PORT = 8799;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
    },
  ],
  webServer: {
    command:
      `node -e "require('fs').rmSync('.wrangler/e2e',{recursive:true,force:true})" && ` +
      `npx wrangler pages dev dist --port ${PORT} --persist-to .wrangler/e2e ` +
      `--binding AUTH_USERNAME=${E2E_USER} --binding AUTH_PASSWORD_HASH=${E2E_HASH} --binding SESSION_SECRET=${E2E_SECRET}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
