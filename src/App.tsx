import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { ActionPlanView } from './components/ActionPlanView.js';
import { AqiHeroCard } from './components/AqiHeroCard.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Header } from './components/Header.js';
import { MoonIcon, SunIcon } from './components/Icons.js';
import { ProfileForm } from './components/ProfileForm.js';
import { DEFAULT_PROFILE } from './constants/index.js';
import { useAirQuality } from './hooks/useAirQuality.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { usePlanGenerator } from './hooks/usePlanGenerator.js';
import { TRANSLATIONS } from './i18n/translations.js';
import type { Language, LifestyleProfile } from './types/index.js';
import { loadLanguagePreference, saveLanguagePreference } from './utils/storage.js';

const LazyImpactCalculator = lazy(() => import('./components/ImpactCalculator.js'));
const LazyFollowUpChat = lazy(() => import('./components/FollowUpChat.js'));

function SectionSkeleton({ label }: { label: string }): ReactElement {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="h-56 animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
    />
  );
}

/**
 * Root SafeAir Saathi application orchestrating AQI lookup, profile personalization,
 * Gemini action plan streaming, impact calculator, and follow-up Q&A.
 */
export default function App(): ReactElement {
  const [language, setLanguage] = useState<Language>(() => loadLanguagePreference());
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [profile, setProfile] = useState<LifestyleProfile>(DEFAULT_PROFILE);

  const t = useMemo(() => TRANSLATIONS[language], [language]);

  const {
    location,
    reading,
    isLoadingAqi,
    aqiError,
    searchQuery,
    setSearchQuery,
    searchResults,
    hasSearched,
    isSearching,
    searchError,
    selectCity,
    submitCitySearch,
    loadByCoordinates,
    applyManualAqi,
    refreshAqi,
  } = useAirQuality(language);

  const { isLocating, error: geoError, requestLocation } = useGeolocation(language);
  const {
    plan,
    isGenerating,
    streamCharCount,
    error: planError,
    generatePlan,
    retryLastPlan,
  } = usePlanGenerator();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleToggleLanguage = useCallback((): void => {
    setLanguage((prev) => {
      const next: Language = prev === 'en' ? 'hi' : 'en';
      saveLanguagePreference(next);
      return next;
    });
  }, []);

  const handleGeolocationClick = useCallback(async (): Promise<void> => {
    const coords = await requestLocation();
    if (coords) {
      await loadByCoordinates(coords.latitude, coords.longitude);
    }
  }, [loadByCoordinates, requestLocation]);

  const handleGeneratePlan = useCallback(
    (validatedProfile: LifestyleProfile): void => {
      if (!reading) {
        return;
      }
      void generatePlan({
        location,
        airQuality: reading,
        profile: validatedProfile,
        language,
      });
    },
    [generatePlan, language, location, reading],
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header t={t} language={language} onToggleLanguage={handleToggleLanguage} />

      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 space-y-6"
      >
        <ErrorBoundary
          sectionTitle={t.navAirQuality}
          bodyText={t.errorBoundaryBody}
          retryLabel={t.errorBoundaryRetry}
        >
          <AqiHeroCard
            t={t}
            language={language}
            location={location}
            reading={reading}
            isLoadingAqi={isLoadingAqi}
            aqiError={aqiError}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchResults={searchResults}
            hasSearched={hasSearched}
            isSearching={isSearching}
            searchError={searchError}
            onSelectCity={selectCity}
            onSubmitCitySearch={() => void submitCitySearch()}
            onRequestGeolocation={() => void handleGeolocationClick()}
            isLocating={isLocating}
            geoError={geoError}
            onApplyManualAqi={applyManualAqi}
            onRefreshAqi={refreshAqi}
          />
        </ErrorBoundary>

        <ErrorBoundary
          sectionTitle={t.profileTitle}
          bodyText={t.errorBoundaryBody}
          retryLabel={t.errorBoundaryRetry}
        >
          <ProfileForm
            t={t}
            language={language}
            profile={profile}
            onChange={setProfile}
            onSubmit={handleGeneratePlan}
            isGenerating={isGenerating}
            hasReading={Boolean(reading)}
          />
        </ErrorBoundary>

        <ErrorBoundary
          sectionTitle={t.planTitle}
          bodyText={t.errorBoundaryBody}
          retryLabel={t.errorBoundaryRetry}
        >
          <ActionPlanView
            t={t}
            language={language}
            plan={plan}
            isGenerating={isGenerating}
            streamCharCount={streamCharCount}
            error={planError}
            onRetry={() => void retryLastPlan()}
            currentLocation={location}
            currentReading={reading}
            currentProfile={profile}
            onRegenerateForCurrent={() => {
              if (reading) {
                void generatePlan({
                  location,
                  airQuality: reading,
                  profile,
                  language,
                  bypassCache: true,
                });
              }
            }}
          />
        </ErrorBoundary>

        <ErrorBoundary
          sectionTitle={t.impactTitle}
          bodyText={t.errorBoundaryBody}
          retryLabel={t.errorBoundaryRetry}
        >
          <Suspense fallback={<SectionSkeleton label={t.impactTitle} />}>
            <LazyImpactCalculator t={t} language={language} />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary
          sectionTitle={t.chatTitle}
          bodyText={t.errorBoundaryBody}
          retryLabel={t.errorBoundaryRetry}
        >
          <Suspense fallback={<SectionSkeleton label={t.chatTitle} />}>
            <LazyFollowUpChat
              t={t}
              language={language}
              location={location}
              reading={reading}
              plan={plan}
            />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 py-5 sm:px-6 text-xs text-slate-600 dark:text-slate-400">
          <p>{t.footerText}</p>
          <button
            type="button"
            onClick={() => setIsDark((prev) => !prev)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            <span>{isDark ? t.themeToggleLight : t.themeToggleDark}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
