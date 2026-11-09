// Applies the saved theme before first paint to avoid a light/dark flash.
(function () {
  try {
    var t = localStorage.getItem('money:theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) {
    /* storage unavailable */
  }
})();
