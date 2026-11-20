import { useState, type FormEvent, type ReactElement } from 'react';
import { MAX_FREE_TEXT_LENGTH } from '../constants/index.ts';
import type { TranslationDictionary } from '../i18n/translations.ts';
import type {
  BudgetLevel,
  CommuteMode,
  CookingFuel,
  HomeType,
  HouseholdGroup,
  Language,
  LifestyleProfile,
  WorkStyle,
} from '../types/index.ts';
import { validateProfile } from '../utils/validation.ts';

interface ProfileFormProps {
  t: TranslationDictionary;
  language?: Language;
  profile: LifestyleProfile;
  onChange: (nextProfile: LifestyleProfile) => void;
  onSubmit: (validatedProfile: LifestyleProfile) => void;
  isGenerating: boolean;
  hasReading: boolean;
}

const HOUSEHOLD_GROUPS: readonly HouseholdGroup[] = [
  'children',
  'elderly',
  'respiratory',
  'pregnant',
];

const COMMUTE_MODES: readonly CommuteMode[] = [
  'walk',
  'bike',
  'bus',
  'metro',
  'two_wheeler',
  'car',
];

const WORK_STYLES: readonly WorkStyle[] = ['wfh', 'office', 'outdoor'];
const HOME_TYPES: readonly HomeType[] = ['apartment', 'house'];
const COOKING_FUELS: readonly CookingFuel[] = ['lpg', 'induction', 'wood', 'other'];
const BUDGET_LEVELS: readonly BudgetLevel[] = ['low', 'medium', 'high'];

/**
 * Accessible household and lifestyle profile form with Zod validation and ARIA error linking.
 */
export function ProfileForm({
  t,
  language = 'en',
  profile,
  onChange,
  onSubmit,
  isGenerating,
  hasReading,
}: ProfileFormProps): ReactElement {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggleHousehold = (group: HouseholdGroup): void => {
    const exists = profile.household.includes(group);
    const nextHousehold = exists
      ? profile.household.filter((item) => item !== group)
      : [...profile.household, group];
    onChange({ ...profile, household: nextHousehold });
  };

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const validation = validateProfile(profile, language);
    if (!validation.success) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    onChange(validation.data);
    onSubmit(validation.data);
  };

  return (
    <section
      id="lifestyle-profile"
      aria-labelledby="profile-section-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8"
    >
      <div className="max-w-3xl">
        <h2
          id="profile-section-heading"
          className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100"
        >
          {t.profileTitle}
        </h2>
        <p className="mt-1.5 text-sm sm:text-base text-slate-600 dark:text-slate-300">
          {t.profileSubtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-6">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t.householdLabel}
          </legend>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {HOUSEHOLD_GROUPS.map((group) => {
              const checked = profile.household.includes(group);
              return (
                <label
                  key={group}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    checked
                      ? 'border-teal-700 bg-teal-50 text-teal-950 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-100'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleHousehold(group)}
                    className="h-5 w-5 rounded border-slate-400 text-teal-700"
                  />
                  <span>{t.householdOptions[group]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label
              htmlFor="commute-mode-select"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {t.commuteLabel}
            </label>
            <select
              id="commute-mode-select"
              aria-required="true"
              value={profile.commuteMode}
              onChange={(e) => onChange({ ...profile, commuteMode: e.target.value as CommuteMode })}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {COMMUTE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t.commuteOptions[mode]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="work-style-select"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {t.workStyleLabel}
            </label>
            <select
              id="work-style-select"
              aria-required="true"
              value={profile.workStyle}
              onChange={(e) => onChange({ ...profile, workStyle: e.target.value as WorkStyle })}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {WORK_STYLES.map((style) => (
                <option key={style} value={style}>
                  {t.workStyleOptions[style]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="home-type-select"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {t.homeTypeLabel}
            </label>
            <select
              id="home-type-select"
              aria-required="true"
              value={profile.homeType}
              onChange={(e) => onChange({ ...profile, homeType: e.target.value as HomeType })}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {HOME_TYPES.map((home) => (
                <option key={home} value={home}>
                  {t.homeTypeOptions[home]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cooking-fuel-select"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {t.cookingFuelLabel}
            </label>
            <select
              id="cooking-fuel-select"
              aria-required="true"
              value={profile.cookingFuel}
              onChange={(e) => onChange({ ...profile, cookingFuel: e.target.value as CookingFuel })}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {COOKING_FUELS.map((fuel) => (
                <option key={fuel} value={fuel}>
                  {t.cookingFuelOptions[fuel]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="budget-select"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {t.budgetLabel}
            </label>
            <select
              id="budget-select"
              aria-required="true"
              value={profile.budget}
              onChange={(e) => onChange({ ...profile, budget: e.target.value as BudgetLevel })}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {BUDGET_LEVELS.map((tier) => (
                <option key={tier} value={tier}>
                  {t.budgetOptions[tier]}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t.purifierLabel}
            </legend>
            <div className="mt-2 flex gap-3">
              <label
                className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  profile.hasAirPurifier
                    ? 'border-teal-700 bg-teal-50 text-teal-950 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-100'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="hasAirPurifier"
                  checked={profile.hasAirPurifier}
                  onChange={() => onChange({ ...profile, hasAirPurifier: true })}
                  className="h-4 w-4 text-teal-700"
                />
                <span>{t.purifierYes}</span>
              </label>
              <label
                className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  !profile.hasAirPurifier
                    ? 'border-teal-700 bg-teal-50 text-teal-950 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-100'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="hasAirPurifier"
                  checked={!profile.hasAirPurifier}
                  onChange={() => onChange({ ...profile, hasAirPurifier: false })}
                  className="h-4 w-4 text-teal-700"
                />
                <span>{t.purifierNo}</span>
              </label>
            </div>
          </fieldset>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="profile-notes-textarea"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              {t.notesLabel}
            </label>
            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
              {profile.notes.length}/{MAX_FREE_TEXT_LENGTH} {t.notesCounterSuffix}
            </span>
          </div>
          <textarea
            id="profile-notes-textarea"
            rows={2}
            value={profile.notes}
            onChange={(e) => onChange({ ...profile, notes: e.target.value })}
            placeholder={t.notesPlaceholder}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? 'profile-notes-error' : undefined}
            className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-600 dark:placeholder:text-slate-400"
          />
          {errors.notes && (
            <p
              id="profile-notes-error"
              role="alert"
              className="mt-1.5 text-sm font-medium text-red-700 dark:text-red-300"
            >
              {errors.notes}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <button
            type="submit"
            disabled={isGenerating || !hasReading}
            aria-busy={isGenerating}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-teal-800 px-6 py-3 text-base font-semibold text-white hover:bg-teal-900 dark:bg-teal-700 dark:hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {isGenerating ? t.generatingPlanBtn : t.generatePlanBtn}
          </button>
        </div>
      </form>
    </section>
  );
}
