import { IMPACT_CHOICES, MAX_COMBINED_PM25_REDUCTION_PERCENT } from '../constants/index.ts';
import type { ImpactChoiceId, ImpactEstimate, Language } from '../types/index.ts';

/**
 * Computes approximate weekly CO2 savings (grams) and combined PM2.5 exposure reduction (%).
 * Exposure reductions combine multiplicatively so overlapping actions never exceed realistic bounds.
 *
 * @param selectedChoices - List of selected weekly impact action identifiers.
 * @returns Approximate weekly {@link ImpactEstimate} across CO2 and PM2.5 exposure.
 */
export function calculateWeeklyImpact(selectedChoices: readonly ImpactChoiceId[]): ImpactEstimate {
  const uniqueIds = Array.from(new Set(selectedChoices));
  let totalCo2Grams = 0;
  let remainingExposureFraction = 1;

  for (const choiceId of uniqueIds) {
    const def = IMPACT_CHOICES.find((item) => item.id === choiceId);
    if (!def) {
      continue;
    }
    totalCo2Grams += def.approxCo2SavedGramsPerWeek;
    remainingExposureFraction *= 1 - def.approxPm25ReductionFraction;
  }

  const rawReductionPercent = Math.round((1 - remainingExposureFraction) * 100);
  const cappedReductionPercent = Math.min(
    MAX_COMBINED_PM25_REDUCTION_PERCENT,
    Math.max(0, rawReductionPercent),
  );

  return {
    approxCo2SavedGramsPerWeek: Math.round(totalCo2Grams),
    approxPm25ReductionPercent: cappedReductionPercent,
    selectedChoices: uniqueIds,
  };
}

/**
 * Formats weekly CO2 savings clearly as an approximate figure in grams or kilograms.
 *
 * @param grams - Estimated weekly CO2 savings in grams.
 * @param language - Target UI display language (`'en'` or `'hi'`).
 * @returns Localized human-readable approximate CO2 string.
 */
export function formatApproxCo2(grams: number, language: Language): string {
  const safeGrams = Math.max(0, Math.round(grams));
  if (safeGrams >= 1000) {
    const kg = (safeGrams / 1000).toFixed(1);
    return language === 'hi' ? `लगभग ${kg} किग्रा CO₂` : `Approx. ${kg} kg CO₂`;
  }
  return language === 'hi' ? `लगभग ${safeGrams} ग्राम CO₂` : `Approx. ${safeGrams} g CO₂`;
}
