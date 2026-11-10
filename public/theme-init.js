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
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) metas[i].content = dark ? '#0a0a0a' : '#fafafa';
})();
