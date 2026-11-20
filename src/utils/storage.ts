import { LANGUAGE_STORAGE_KEY } from '../constants/index.js';
import type { Language } from '../types/index.js';

/**
 * Reads the persisted UI language preference safely.
 * No other user data or coordinates are stored in `localStorage`.
 *
 * @returns Persisted {@link Language} preference, defaulting to `'en'` on unavailability.
 */
export function loadLanguagePreference(): Language {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'hi' || saved === 'en') {
      return saved;
    }
    return 'en';
  } catch {
    return 'en';
  }
}

/**
 * Persists only the user's UI language preference in `localStorage` safely.
 *
 * @param language - Selected UI language (`'en'` or `'hi'`).
 */
export function saveLanguagePreference(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage quota or private-mode errors gracefully.
  }
}
