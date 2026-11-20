import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis.ts';
import type { TranslationDictionary } from '../i18n/translations.ts';
import type { ActionPlan, Language, PlanSectionKey, RecommendationItem } from '../types/index.ts';
import { ShieldIcon, StopIcon, VolumeIcon } from './Icons.tsx';

interface ActionPlanViewProps {
  t: TranslationDictionary;
  language: Language;
  plan: ActionPlan | null;
  isGenerating: boolean;
  streamCharCount: number;
  error: string | null;
  onRetry: () => void;
}

const SECTION_ORDER: readonly PlanSectionKey[] = [
  'dailyRoutine',
  'indoorAirHacks',
  'sustainableAlternatives',
  'healthProtection',
];

function RecommendationCard({
  item,
  t,
}: {
  item: RecommendationItem;
  t: TranslationDictionary;
}): ReactElement {
  return (
    <article className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{item.title}</h3>
        {item.timeWindow && (
          <span className="text-xs font-medium text-teal-800 dark:text-teal-300 tabular-nums">
            {item.timeWindow}
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{item.detail}</p>

      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 text-sm">
        <p className="text-slate-800 dark:text-slate-200">
          <span className="font-semibold">{t.whyItHelpsLabel}: </span>
          {item.whyItHelps}
        </p>
        <p className="text-teal-900 dark:text-teal-200 font-medium tabular-nums">
          <span className="font-semibold">{t.estimatedImpactLabel}: </span>
          {item.estimatedImpact}
        </p>
      </div>
    </article>
  );
}

/**
 * Displays the 4-section personalized plan with WAI-ARIA tabs, streaming skeleton,
 * medical disclaimer, Read Aloud control, and error/fallback states.
 */
export function ActionPlanView({
  t,
  language,
  plan,
  isGenerating,
  streamCharCount,
  error,
  onRetry,
}: ActionPlanViewProps): ReactElement {
  const [activeTab, setActiveTab] = useState<PlanSectionKey>('dailyRoutine');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { isSupported, isSpeaking, speak, stop } = useSpeechSynthesis();

  const tabLabels: Record<PlanSectionKey, string> = {
    dailyRoutine: t.tabDailyRoutine,
    indoorAirHacks: t.tabIndoorHacks,
    sustainableAlternatives: t.tabSustainable,
    healthProtection: t.tabHealthProtection,
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number): void => {
    let nextIndex: number;
    if (e.key === 'ArrowRight') {
      nextIndex = (idx + 1) % SECTION_ORDER.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (idx - 1 + SECTION_ORDER.length) % SECTION_ORDER.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = SECTION_ORDER.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextKey = SECTION_ORDER[nextIndex];
    setActiveTab(nextKey);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleReadAloud = (): void => {
    if (!plan) {
      return;
    }
    if (isSpeaking) {
      stop();
      return;
    }
    const items = plan[activeTab];
    const spokenParts = [
      plan.summary,
      `${tabLabels[activeTab]}.`,
      ...items.map(
        (item) =>
          `${item.title}. ${item.detail} ${t.whyItHelpsLabel}: ${item.whyItHelps}. ${t.estimatedImpactLabel}: ${item.estimatedImpact}.`,
      ),
    ];
    speak(spokenParts.join(' '), language);
  };

  return (
    <section
      id="action-plan"
      aria-labelledby="plan-section-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2
            id="plan-section-heading"
            className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100"
          >
            {t.planTitle}
          </h2>
          <p className="mt-1 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            {t.planSubtitle}
          </p>
        </div>

        {plan && isSupported && (
          <button
            type="button"
            onClick={handleReadAloud}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            {isSpeaking ? (
              <>
                <StopIcon className="w-4 h-4" />
                <span>{t.stopReadingBtn}</span>
              </>
            ) : (
              <>
                <VolumeIcon className="w-4 h-4" />
                <span>{t.readAloudBtn}</span>
              </>
            )}
          </button>
        )}
      </div>

      <aside
        role="note"
        aria-label={t.medicalDisclaimerTitle}
        className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-4 text-sm text-amber-950 dark:text-amber-100 flex items-start gap-3"
      >
        <ShieldIcon className="w-5 h-5 mt-0.5 shrink-0 text-amber-800 dark:text-amber-300" />
        <div>
          <p className="font-semibold">{t.medicalDisclaimerTitle}</p>
          <p className="mt-0.5 leading-relaxed">{t.medicalDisclaimerText}</p>
        </div>
      </aside>

      <div aria-live="polite">
        {isGenerating && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-teal-800 dark:text-teal-300 tabular-nums">
              {t.planStreamingNotice}
              {streamCharCount > 0 ? ` (${streamCharCount})` : ''}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-36 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-36 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        )}

        {error && !isGenerating && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4 text-red-900 dark:text-red-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5"
          >
            <div>
              <p className="font-semibold">{t.geminiErrorTitle}</p>
              <p className="text-sm mt-0.5">{error}</p>
              {plan?.isFallback && (
                <p className="text-xs mt-1 text-red-800 dark:text-red-200">
                  {t.fallbackBannerNotice}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 transition-colors whitespace-nowrap shrink-0"
            >
              {t.retryBtn}
            </button>
          </div>
        )}

        {!isGenerating && !plan && !error && (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.planEmptyTitle}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              {t.planEmptyBody}
            </p>
          </div>
        )}

        {plan && !isGenerating && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-3">
              <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100">
                {plan.summary}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    {t.bestWindowLabel}:{' '}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{plan.bestTimeWindow}</span>
                </div>
                <div>
                  <span className="font-semibold text-rose-800 dark:text-rose-300">
                    {t.worstWindowLabel}:{' '}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{plan.worstTimeWindow}</span>
                </div>
              </div>
            </div>

            <div>
              <div
                role="tablist"
                aria-label={t.planTitle}
                className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3"
              >
                {SECTION_ORDER.map((sectionKey, idx) => {
                  const isActive = activeTab === sectionKey;
                  return (
                    <button
                      key={sectionKey}
                      ref={(el) => {
                        tabRefs.current[idx] = el;
                      }}
                      id={`plan-tab-${sectionKey}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`plan-panel-${sectionKey}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveTab(sectionKey)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                      className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-teal-800 text-white dark:bg-teal-700'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tabLabels[sectionKey]}
                    </button>
                  );
                })}
              </div>

              {SECTION_ORDER.map((sectionKey) => {
                const isActive = activeTab === sectionKey;
                return (
                  <div
                    key={sectionKey}
                    id={`plan-panel-${sectionKey}`}
                    role="tabpanel"
                    aria-labelledby={`plan-tab-${sectionKey}`}
                    hidden={!isActive}
                    className="pt-5"
                  >
                    {isActive && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plan[sectionKey].map((item, idx) => (
                          <RecommendationCard
                            key={`${sectionKey}-${idx}-${item.title}`}
                            item={item}
                            t={t}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
