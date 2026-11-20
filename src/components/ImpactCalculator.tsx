import { memo, useMemo, useState, type ReactElement } from 'react';
import { IMPACT_CHOICES, MAX_COMBINED_PM25_REDUCTION_PERCENT } from '../constants/index.ts';
import type { TranslationDictionary } from '../i18n/translations.ts';
import type { ImpactChoiceId, Language } from '../types/index.ts';
import { calculateWeeklyImpact, formatApproxCo2 } from '../utils/impactCalculator.ts';

interface ImpactCalculatorProps {
  t: TranslationDictionary;
  language: Language;
}

/**
 * Interactive weekly impact calculator showing approximate CO2 avoided and PM2.5 exposure reduction.
 */
export const ImpactCalculator = memo(function ImpactCalculator({
  t,
  language,
}: ImpactCalculatorProps): ReactElement {
  const [selected, setSelected] = useState<ImpactChoiceId[]>(['metro_over_car', 'n95_mask']);

  const toggleChoice = (id: ImpactChoiceId): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const estimate = useMemo(() => calculateWeeklyImpact(selected), [selected]);

  return (
    <section
      id="impact-calculator"
      aria-labelledby="impact-section-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-6"
    >
      <div>
        <h2
          id="impact-section-heading"
          className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100"
        >
          {t.impactTitle}
        </h2>
        <p className="mt-1 text-sm sm:text-base text-slate-600 dark:text-slate-300">
          {t.impactSubtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t.co2SavedLabel}
          </p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold text-teal-800 dark:text-teal-300 tabular-nums">
            {formatApproxCo2(estimate.approxCo2SavedGramsPerWeek, language)}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t.perWeekSuffix}</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5 space-y-3">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t.pm25ReductionLabel}
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
            ~{estimate.approxPm25ReductionPercent}%
          </p>
          <div
            role="progressbar"
            aria-label={t.pm25ReductionLabel}
            aria-valuemin={0}
            aria-valuemax={MAX_COMBINED_PM25_REDUCTION_PERCENT}
            aria-valuenow={estimate.approxPm25ReductionPercent}
            aria-valuetext={`~${estimate.approxPm25ReductionPercent}%`}
            className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-emerald-700 dark:bg-emerald-400 transition-transform"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (estimate.approxPm25ReductionPercent / MAX_COMBINED_PM25_REDUCTION_PERCENT) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="sr-only">{t.impactTitle}</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {IMPACT_CHOICES.map((choice) => {
            const isChecked = selected.includes(choice.id);
            const label = language === 'hi' ? choice.labelHi : choice.labelEn;
            const desc = language === 'hi' ? choice.descriptionHi : choice.descriptionEn;
            const checkboxId = `impact-choice-${choice.id}`;
            return (
              <div
                key={choice.id}
                className={`flex min-h-[44px] items-start gap-3 rounded-lg border p-4 transition-colors ${
                  isChecked
                    ? 'border-teal-700 bg-teal-50/70 dark:border-teal-500 dark:bg-teal-950/50'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleChoice(choice.id)}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-400 text-teal-700"
                />
                <div className="space-y-1">
                  <label
                    htmlFor={checkboxId}
                    className="block cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {label}
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <p className="text-xs text-slate-600 dark:text-slate-400">{t.impactApproxNote}</p>
    </section>
  );
});

export default ImpactCalculator;
