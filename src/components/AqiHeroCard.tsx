import { useState, type FormEvent, type ReactElement } from 'react';
import { MAX_US_AQI, MIN_US_AQI } from '../constants/index.ts';
import type { TranslationDictionary } from '../i18n/translations.ts';
import type { AirQualityReading, Language, LocationData } from '../types/index.ts';
import { formatAqiTimestamp } from '../utils/aqi.ts';
import { AqiStatusIcon, LocateIcon, RefreshIcon, SearchIcon } from './Icons.tsx';

interface AqiHeroCardProps {
  t: TranslationDictionary;
  language: Language;
  location: LocationData;
  reading: AirQualityReading | null;
  isLoadingAqi: boolean;
  aqiError: string | null;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  searchResults: LocationData[];
  hasSearched?: boolean;
  isSearching: boolean;
  searchError: string | null;
  onSelectCity: (city: LocationData) => void;
  onSubmitCitySearch?: () => void;
  onRequestGeolocation: () => void;
  isLocating: boolean;
  geoError: string | null;
  onApplyManualAqi: (aqi: number) => { success: boolean; error?: string };
  onRefreshAqi: () => void;
}

/**
 * Accessible SVG semi-circular AQI gauge with a mandatory localized text alternative.
 */
function AqiGauge({
  aqi,
  accentHex,
  ariaLabel,
}: {
  aqi: number;
  accentHex: string;
  ariaLabel: string;
}): ReactElement {
  const clamped = Math.max(0, Math.min(500, aqi));
  const fraction = clamped / 500;
  const radius = 52;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  return (
    <div className="flex flex-col items-center">
      <svg
        width="140"
        height="84"
        viewBox="0 0 140 84"
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
      >
        <path
          d="M 18 72 A 52 52 0 0 1 122 72"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          className="text-slate-200 dark:text-slate-800"
        />
        <path
          d="M 18 72 A 52 52 0 0 1 122 72"
          fill="none"
          stroke={accentHex}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <text
          x="70"
          y="64"
          textAnchor="middle"
          className="fill-slate-900 dark:fill-slate-100 text-3xl font-bold tabular-nums"
        >
          {aqi}
        </text>
      </svg>
    </div>
  );
}

/**
 * Renders the location selector (city search, geolocation, manual AQI last-resort fallback) and live AQI card.
 */
export function AqiHeroCard({
  t,
  language,
  location,
  reading,
  isLoadingAqi,
  aqiError,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  hasSearched = false,
  isSearching,
  searchError,
  onSelectCity,
  onSubmitCitySearch,
  onRequestGeolocation,
  isLocating,
  geoError,
  onApplyManualAqi,
  onRefreshAqi,
}: AqiHeroCardProps): ReactElement {
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('185');
  const [manualError, setManualError] = useState<string | null>(null);

  const handleManualSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const numeric = Number(manualInput);
    const result = onApplyManualAqi(numeric);
    if (!result.success) {
      setManualError(result.error ?? t.manualAqiRangeError);
      return;
    }
    setManualError(null);
    setShowManualForm(false);
  };

  const handleSearchSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (onSubmitCitySearch) {
      onSubmitCitySearch();
    } else if (searchResults.length > 0) {
      onSelectCity(searchResults[0]);
    }
  };

  const categoryLabel = reading
    ? language === 'hi'
      ? reading.category.labelHi
      : reading.category.labelEn
    : '';

  const categorySummary = reading
    ? language === 'hi'
      ? reading.category.summaryHi
      : reading.category.summaryEn
    : '';

  const locationDisplay =
    location.id === 'default-new-delhi' && language === 'hi'
      ? 'नई दिल्ली, दिल्ली, भारत'
      : [location.name, location.admin1, location.country].filter(Boolean).join(', ');

  const formatPollutant = (value: number | null): string =>
    value === null ? t.notAvailable : `${value} ${t.unitUgM3}`;

  const sourceDisplay = reading ? (reading.isManual ? t.manualAqiSource : t.liveAqiSource) : '';

  return (
    <section
      id="air-quality"
      aria-labelledby="aqi-section-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7 space-y-5">
          <div>
            <p className="text-sm font-medium text-teal-800 dark:text-teal-300">{t.heroEyebrow}</p>
            <h1
              id="aqi-section-heading"
              className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]"
            >
              {t.heroTitle}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
              {t.heroSubtitle}
            </p>
          </div>

          <div className="space-y-3">
            <form onSubmit={handleSearchSubmit} className="space-y-2">
              <label
                htmlFor="city-search-input"
                className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                {t.citySearchLabel}
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400">
                    <SearchIcon className="w-4 h-4" />
                  </span>
                  <input
                    id="city-search-input"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                    placeholder={t.citySearchPlaceholder}
                    maxLength={100}
                    autoComplete="off"
                    aria-describedby={searchError ? 'city-search-error' : undefined}
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-600 dark:placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-700 dark:hover:bg-teal-600 transition-colors whitespace-nowrap shrink-0"
                >
                  {t.citySearchBtn}
                </button>
                <button
                  type="button"
                  onClick={onRequestGeolocation}
                  disabled={isLocating}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  <LocateIcon className="w-4 h-4" />
                  <span>{isLocating ? t.locating : t.useMyLocation}</span>
                </button>
              </div>
            </form>

            {isSearching && (
              <p className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
                {t.searchingCities}
              </p>
            )}

            {searchError && (
              <p
                id="city-search-error"
                role="alert"
                className="text-sm text-red-700 dark:text-red-300"
              >
                {searchError}
              </p>
            )}

            {geoError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {geoError}
              </p>
            )}

            {searchResults.length > 0 && (
              <ul
                aria-label={t.matchingCitiesLabel}
                className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {searchResults.map((city) => (
                  <li key={city.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCity(city)}
                      className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="font-medium">{city.name}</span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {[city.admin1, city.country].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!isSearching &&
              hasSearched &&
              searchResults.length === 0 &&
              !searchError &&
              searchQuery.trim().length >= 2 && (
                <p className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
                  {t.cityNoResults}
                </p>
              )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={onRefreshAqi}
                disabled={isLoadingAqi}
                className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-teal-800 dark:text-teal-300 hover:text-teal-900 dark:hover:text-teal-200 disabled:opacity-50"
              >
                <RefreshIcon className="w-4 h-4" />
                <span>{t.refreshReading}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowManualForm((prev) => !prev)}
                aria-expanded={showManualForm}
                className="min-h-[44px] inline-flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 underline underline-offset-4 hover:text-slate-900 dark:hover:text-white"
              >
                {t.manualAqiToggle}
              </button>
            </div>

            {(showManualForm || aqiError) && (
              <form
                onSubmit={handleManualSubmit}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 space-y-3"
              >
                <label
                  htmlFor="manual-aqi-input"
                  className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
                >
                  {t.manualAqiLabel}
                </label>
                <p className="text-xs text-slate-600 dark:text-slate-400">{t.manualAqiHint}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="manual-aqi-input"
                    type="number"
                    min={MIN_US_AQI}
                    max={MAX_US_AQI}
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    aria-describedby={manualError ? 'manual-aqi-error' : undefined}
                    className="min-h-[44px] w-full sm:w-40 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm tabular-nums text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                  >
                    {t.manualAqiApply}
                  </button>
                </div>
                {manualError && (
                  <p
                    id="manual-aqi-error"
                    role="alert"
                    className="text-sm text-red-700 dark:text-red-300"
                  >
                    {manualError}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        <div className="lg:col-span-5" aria-live="polite" aria-busy={isLoadingAqi}>
          {isLoadingAqi && !reading ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-6 space-y-4">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-20 w-36 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <p className="text-xs text-slate-600 dark:text-slate-400">{t.aqiLoading}</p>
            </div>
          ) : aqiError && !reading ? (
            <div
              role="alert"
              className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 p-6 text-red-900 dark:text-red-100 space-y-2"
            >
              <h2 className="text-base font-semibold">{t.aqiErrorTitle}</h2>
              <p className="text-sm">{aqiError}</p>
            </div>
          ) : reading ? (
            <div
              className={`rounded-xl border ${reading.category.borderClass} ${reading.category.surfaceClass} p-6 space-y-4`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {locationDisplay}
                  </p>
                  <div className={`mt-1 flex items-center gap-2 ${reading.category.textClass}`}>
                    <AqiStatusIcon
                      categoryKey={reading.category.key}
                      className="w-5 h-5 shrink-0"
                    />
                    <span className="text-lg font-bold">{categoryLabel}</span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.aqiScaleLabel}
                </span>
              </div>

              <AqiGauge
                aqi={reading.usAqi}
                accentHex={reading.category.accentHex}
                ariaLabel={t.aqiGaugeAriaLabel(reading.usAqi, categoryLabel)}
              />

              <p className={`text-sm leading-relaxed ${reading.category.textClass}`}>
                {categorySummary}
              </p>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-300/60 dark:border-slate-700/60 text-sm">
                <div>
                  <dt className="text-xs text-slate-600 dark:text-slate-400">{t.pollutantPm25}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPollutant(reading.pm25)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600 dark:text-slate-400">{t.pollutantPm10}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPollutant(reading.pm10)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600 dark:text-slate-400">{t.pollutantNo2}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPollutant(reading.no2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600 dark:text-slate-400">{t.pollutantO3}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatPollutant(reading.o3)}
                  </dd>
                </div>
              </dl>

              <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                <span>
                  {t.aqiSourceLabel}: {sourceDisplay}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {t.updatedLabel}: {formatAqiTimestamp(reading.timestamp, language)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
