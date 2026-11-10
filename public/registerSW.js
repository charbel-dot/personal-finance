// Compatibility shim: pages cached by releases before 1.1.0 load /registerSW.js. The app now
// registers the service worker itself; this just keeps those old pages updating to the new one.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((r) => r.update())
    .catch(() => {});
}
