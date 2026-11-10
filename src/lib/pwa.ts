import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 60 * 60 * 1000;
export const APP_VERSION = __APP_VERSION__;

/**
 * Deletes Cache Storage left behind by older releases (and the pre-versioning caches). The current
 * service worker's caches are named `money-<version>-…` and are kept; anything missing from them is
 * fetched from the network, so this is always safe.
 */
async function purgeStaleCaches() {
  if (!('caches' in window)) return;
  const current = `money-${APP_VERSION}-`;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => !n.startsWith(current)).map((n) => caches.delete(n)));
}

/**
 * Registers the service worker. With `autoUpdate`, a new deploy is picked up as soon as the browser
 * notices a new sw.js, and the page reloads onto it. Installed PWAs (iOS especially) are rarely
 * relaunched, so also check whenever the app returns to the foreground, and hourly while open.
 */
export function registerPwa() {
  purgeStaleCaches().catch(() => {
    // Cache Storage unavailable (private mode); nothing to clean.
  });
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      let last = Date.now();
      const check = () => {
        if (!navigator.onLine || registration.installing) return;
        last = Date.now();
        registration.update().catch(() => {
          // Offline or the server is unreachable; try again next time.
        });
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - last > 30_000) check();
      });
      setInterval(check, CHECK_EVERY_MS);
    },
  });
}
