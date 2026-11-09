// Applies the saved theme before first paint (no light/dark flash). Default follows the OS.
(function () {
  var pref = null;
  try {
    pref = localStorage.getItem('money:theme');
  } catch (e) {
    /* storage unavailable */
  }
  var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
