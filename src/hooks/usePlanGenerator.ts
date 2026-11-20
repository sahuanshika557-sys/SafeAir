import { useCallback, useEffect, useRef, useState } from 'react';
import { generatePersonalizedPlan } from '../services/gemini.ts';
import type {
  ActionPlan,
  AirQualityReading,
  Language,
  LifestyleProfile,
  LocationData,
} from '../types/index.ts';
import { buildRuleBasedFallbackPlan } from '../utils/fallbackPlan.ts';
import { isAbortError } from '../utils/network.ts';

/**
 * State and actions returned by {@link usePlanGenerator}.
 */
export interface UsePlanGeneratorReturn {
  plan: ActionPlan | null;
  isGenerating: boolean;
  streamCharCount: number;
  error: string | null;
  generatePlan: (params: {
    location: LocationData;
    airQuality: AirQualityReading;
    profile: LifestyleProfile;
    language: Language;
    bypassCache?: boolean;
  }) => Promise<void>;
  retryLastPlan: () => Promise<void>;
}

/**
 * Manages streaming personalized action plan generation with `AbortController` cancellation,
 * retry support, and automatic rule-based fallback on AI errors.
 *
 * @returns Reactive plan generation state, stream progress counter, and generation/retry handlers.
 */
export function usePlanGenerator(): UsePlanGeneratorReturn {
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamCharCount, setStreamCharCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<{
    location: LocationData;
    airQuality: AirQualityReading;
    profile: LifestyleProfile;
    language: Language;
  } | null>(null);

  useEffect(() => {
    return (): void => {
      abortRef.current?.abort();
    };
  }, []);

  const generatePlan = useCallback(
    async (params: {
      location: LocationData;
      airQuality: AirQualityReading;
      profile: LifestyleProfile;
      language: Language;
      bypassCache?: boolean;
    }): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastRequestRef.current = {
        location: params.location,
        airQuality: params.airQuality,
        profile: params.profile,
        language: params.language,
      };

      setIsGenerating(true);
      setStreamCharCount(0);
      setError(null);

      try {
        const result = await generatePersonalizedPlan({
          ...params,
          signal: controller.signal,
          onStreamProgress: (partial) => {
            if (!controller.signal.aborted) {
              setStreamCharCount(partial.length);
            }
          },
        });
        if (!controller.signal.aborted) {
          setPlan(result);
        }
      } catch (err: unknown) {
        if (isAbortError(err)) {
          return;
        }
        if (!controller.signal.aborted) {
          const fallbackMsg =
            params.language === 'hi'
              ? 'अभी AI योजना तैयार नहीं हो सकी। नियम-आधारित मार्गदर्शन दिखाया जा रहा है।'
              : 'Unable to generate AI plan right now. Showing rule-based guidance.';
          setError(err instanceof Error ? err.message : fallbackMsg);
          setPlan(
            buildRuleBasedFallbackPlan(
              params.airQuality,
              params.profile,
              params.language,
              params.location,
            ),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsGenerating(false);
        }
      }
    },
    [],
  );

  const retryLastPlan = useCallback(async (): Promise<void> => {
    const last = lastRequestRef.current;
    if (!last) {
      return;
    }
    await generatePlan({ ...last, bypassCache: true });
  }, [generatePlan]);

  return {
    plan,
    isGenerating,
    streamCharCount,
    error,
    generatePlan,
    retryLastPlan,
  };
}
