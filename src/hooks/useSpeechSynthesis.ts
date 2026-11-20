import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../types/index.ts';

/**
 * State and controls returned by {@link useSpeechSynthesis}.
 */
export interface UseSpeechSynthesisReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string, language: Language) => void;
  stop: () => void;
}

/**
 * Accessible Web Speech API wrapper with safe feature detection and cleanup on unmount.
 *
 * @returns Browser speech support status, playback state, and `speak`/`stop` controls.
 */
export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const stop = useCallback((): void => {
    if (!isSupported) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore synthesis cancellation errors.
    }
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, language: Language): void => {
      if (!isSupported || !text.trim()) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
        utterance.rate = 0.96;
        utterance.onend = (): void => setIsSpeaking(false);
        utterance.onerror = (): void => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [isSupported],
  );

  useEffect(() => {
    return (): void => {
      if (isSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore cleanup errors.
        }
      }
    };
  }, [isSupported]);

  return {
    isSupported,
    isSpeaking,
    speak,
    stop,
  };
}
