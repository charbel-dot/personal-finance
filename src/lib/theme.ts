import { useCallback, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'money:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Theme preference is per-device (stored locally), applied via <html data-theme>. */
export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [theme, setThemeState] = useState<ThemePref>(read);
  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, []);
  return [theme, setTheme];
}
