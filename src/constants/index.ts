import type { AqiCategoryInfo, ImpactChoiceDefinition, LifestyleProfile } from '../types/index.ts';

/** Network timeout in milliseconds for external and AI requests. */
export const API_TIMEOUT_MS = 15000;

/** Geocoding search debounce delay in milliseconds. */
export const GEOCODING_DEBOUNCE_MS = 400;

/** In-memory cache TTL for air quality readings (10 minutes). */
export const AQI_CACHE_TTL_MS = 10 * 60 * 1000;

/** In-memory cache TTL for generated plans (30 minutes). */
export const PLAN_CACHE_TTL_MS = 30 * 60 * 1000;

/** Maximum allowed AI requests per client per sliding window. */
export const RATE_LIMIT_MAX_REQUESTS = 10;

/** Sliding rate limit window duration (1 minute). */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Maximum length for user free-text notes and chat prompts. */
export const MAX_FREE_TEXT_LENGTH = 500;

/** Maximum length for city search queries. */
export const MAX_SEARCH_QUERY_LENGTH = 100;

/** Minimum query length before calling the geocoding API. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Maximum manual AQI input bound. */
export const MAX_US_AQI = 500;

/** Minimum manual AQI input bound. */
export const MIN_US_AQI = 0;

/** Maximum chat turns retained in prompt context. */
export const MAX_CHAT_HISTORY_MESSAGES = 8;

/** Primary Gemini model identifier (widely available on public Gemini API; overridable via GEMINI_MODEL). */
export const GEMINI_MODEL = 'gemini-2.5-flash';

/** Fallback Gemini model identifier if primary model is unavailable or overloaded. */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/** Open-Meteo Geocoding API endpoint. */
export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Open-Meteo Air Quality API endpoint. */
export const OPEN_METEO_AQI_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** Free no-key reverse geocoding API endpoint called strictly server-side. */
export const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/** Server-side reverse geocoding cache TTL (1 hour). */
export const REVERSE_GEOCODE_CACHE_TTL_MS = 60 * 60 * 1000;

/** Overall server-side Gemini timeout budget (within Vercel 60s maxDuration). */
export const SERVER_GEMINI_TOTAL_TIMEOUT_MS = 45000;

/** LocalStorage key for language preference only. */
export const LANGUAGE_STORAGE_KEY = 'safeair_saathi_language';

/** Maximum defensible combined PM2.5 exposure reduction cap (%). */
export const MAX_COMBINED_PM25_REDUCTION_PERCENT = 65;

/** Diminishing-returns factor applied to each additional overlapping exposure swap. */
export const IMPACT_DIMINISHING_FACTOR = 0.85;

/** Default initial location (New Delhi, India) for immediate first-load utility. */
export const DEFAULT_LOCATION = {
  id: 'default-new-delhi',
  name: 'New Delhi',
  admin1: 'Delhi',
  country: 'India',
  latitude: 28.6139,
  longitude: 77.209,
  source: 'search' as const,
};

/** Default lifestyle profile values. */
export const DEFAULT_PROFILE: LifestyleProfile = {
  household: ['children'],
  commuteMode: 'metro',
  workStyle: 'office',
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'medium',
  notes: '',
};

/**
 * US EPA AQI breakpoints, labels (EN/HI), and high-contrast color tokens.
 */
export const AQI_CATEGORIES: readonly AqiCategoryInfo[] = [
  {
    key: 'good',
    labelEn: 'Good',
    labelHi: 'अच्छा',
    minAqi: 0,
    maxAqi: 50,
    accentHex: '#15803d',
    surfaceClass: 'bg-emerald-50 dark:bg-emerald-950/60',
    textClass: 'text-emerald-800 dark:text-emerald-200',
    borderClass: 'border-emerald-300 dark:border-emerald-700',
    summaryEn: 'Air quality poses little or no risk for most people.',
    summaryHi: 'हवा की गुणवत्ता अधिकांश लोगों के लिए सुरक्षित है।',
  },
  {
    key: 'moderate',
    labelEn: 'Moderate',
    labelHi: 'मध्यम',
    minAqi: 51,
    maxAqi: 100,
    accentHex: '#a16207',
    surfaceClass: 'bg-amber-50 dark:bg-amber-950/60',
    textClass: 'text-amber-900 dark:text-amber-200',
    borderClass: 'border-amber-300 dark:border-amber-700',
    summaryEn:
      'Acceptable air quality; unusually sensitive individuals should limit prolonged exertion.',
    summaryHi: 'हवा की गुणवत्ता ठीक है; अत्यधिक संवेदनशील लोग बाहर भारी मेहनत कम करें।',
  },
  {
    key: 'sensitive',
    labelEn: 'Unhealthy for Sensitive Groups',
    labelHi: 'संवेदनशील समूहों के लिए अस्वस्थ',
    minAqi: 101,
    maxAqi: 150,
    accentHex: '#c2410c',
    surfaceClass: 'bg-orange-50 dark:bg-orange-950/60',
    textClass: 'text-orange-900 dark:text-orange-200',
    borderClass: 'border-orange-300 dark:border-orange-700',
    summaryEn:
      'Children, elderly, pregnant people, and respiratory patients may experience effects.',
    summaryHi: 'बच्चों, बुजुर्गों, गर्भवती महिलाओं और सांस के रोगियों को परेशानी हो सकती है।',
  },
  {
    key: 'unhealthy',
    labelEn: 'Unhealthy',
    labelHi: 'अस्वस्थ',
    minAqi: 151,
    maxAqi: 200,
    accentHex: '#b91c1c',
    surfaceClass: 'bg-red-50 dark:bg-red-950/60',
    textClass: 'text-red-900 dark:text-red-200',
    borderClass: 'border-red-300 dark:border-red-700',
    summaryEn: 'Everyone may begin to experience health effects; wear N95/FFP2 outdoors.',
    summaryHi: 'हर किसी के स्वास्थ्य पर असर पड़ सकता है; बाहर निकलते समय N95/FFP2 मास्क पहनें।',
  },
  {
    key: 'very_unhealthy',
    labelEn: 'Very Unhealthy',
    labelHi: 'बहुत अस्वस्थ',
    minAqi: 201,
    maxAqi: 300,
    accentHex: '#7e22ce',
    surfaceClass: 'bg-purple-50 dark:bg-purple-950/60',
    textClass: 'text-purple-900 dark:text-purple-200',
    borderClass: 'border-purple-300 dark:border-purple-700',
    summaryEn:
      'Health alert: avoid outdoor exertion, seal windows during peak smog, and filter indoor air.',
    summaryHi: 'स्वास्थ्य चेतावनी: बाहर व्यायाम से बचें, स्मॉग के समय खिड़कियाँ बंद रखें।',
  },
  {
    key: 'hazardous',
    labelEn: 'Hazardous',
    labelHi: 'खतरनाक',
    minAqi: 301,
    maxAqi: 500,
    accentHex: '#881337',
    surfaceClass: 'bg-rose-100 dark:bg-rose-950/80',
    textClass: 'text-rose-950 dark:text-rose-100',
    borderClass: 'border-rose-400 dark:border-rose-700',
    summaryEn:
      'Emergency conditions: stay indoors with clean air filtration and monitor symptoms closely.',
    summaryHi: 'आपातकालीन स्थिति: स्वच्छ हवा वाले कमरे में अंदर रहें और लक्षणों पर ध्यान दें।',
  },
] as const;

/**
 * Interactive impact calculator options with approximate weekly estimates.
 * Values represent conservative, order-of-magnitude weekly approximations.
 */
export const IMPACT_CHOICES: readonly ImpactChoiceDefinition[] = [
  {
    id: 'metro_over_car',
    labelEn: 'Take Metro / Bus instead of solo Car (5 days/week)',
    labelHi: 'अकेले कार के बजाय मेट्रो / बस लें (सप्ताह में 5 दिन)',
    descriptionEn:
      'Assumes replacing ~15 km/day solo petrol car (~192 g CO₂/km) with electric/shared transit; lowers in-traffic NO₂/PM2.5 spikes.',
    descriptionHi:
      'लगभग 15 किमी/दिन अकेली पेट्रोल कार यात्रा को मेट्रो/बस से बदलने पर आधारित; ट्रैफिक के धुएं से संपर्क घटता है।',
    approxCo2SavedGramsPerWeek: 11500,
    approxPm25ReductionFraction: 0.08,
  },
  {
    id: 'n95_mask',
    labelEn: 'Wear a well-fitted N95 / FFP2 mask outdoors',
    labelHi: 'बाहर अच्छी फिटिंग वाला N95 / FFP2 मास्क पहनें',
    descriptionEn:
      'Assumes ~90%+ filtration while commuting/walking outdoors (~35% of daily breathing share after accounting for facial seal gaps).',
    descriptionHi:
      'बाहर आवागमन के समय सही फिटिंग वाले N95 मास्क से कण छनने पर आधारित (चेहरे की सील और घर के अंदर के समय को ध्यान में रखते हुए)।',
    approxCo2SavedGramsPerWeek: 0,
    approxPm25ReductionFraction: 0.3,
  },
  {
    id: 'induction_over_wood',
    labelEn: 'Use Induction / Electric or LPG instead of Wood/Biomass',
    labelHi: 'लकड़ी/कोयले के बजाय इंडक्शन या एलपीजी का उपयोग करें',
    descriptionEn:
      'Eliminates peak indoor solid-fuel smoke during cooking hours (ambient outdoor infiltration still remains).',
    descriptionHi:
      'खाना पकाने के समय घर के भीतर ठोस ईंधन के धुएं को हटाता है (बाहरी हवा का प्रभाव फिर भी बना रहता है)।',
    approxCo2SavedGramsPerWeek: 6200,
    approxPm25ReductionFraction: 0.22,
  },
  {
    id: 'no_waste_burning',
    labelEn: 'Compost or segregate leaves instead of open burning',
    labelHi: 'सूखे पत्ते या कचरा जलाने के बजाय खाद/अलग निपटान करें',
    descriptionEn:
      'Prevents intense localized neighborhood smoke plumes (~15 kg dry biomass/week avoided).',
    descriptionHi: 'पड़ोस में सूखे पत्ते/कचरा जलने से उठने वाले स्थानीय जहरीले धुएं को रोकता है।',
    approxCo2SavedGramsPerWeek: 3400,
    approxPm25ReductionFraction: 0.08,
  },
  {
    id: 'hepa_seal_windows',
    labelEn: 'Seal window gaps & run HEPA purifier / DIY box-fan filter',
    labelHi: 'खिड़की की दरारें सील करें और HEPA / DIY फ़िल्टर चलाएँ',
    descriptionEn:
      'Assumes filtering one main bedroom/living area overnight with doors closed during peak winter inversion.',
    descriptionHi: 'रात के पीक स्मॉग में दरवाजा बंद कर मुख्य कमरे में HEPA या बॉक्स-फैन फ़िल्टर चलाने पर आधारित।',
    approxCo2SavedGramsPerWeek: 0,
    approxPm25ReductionFraction: 0.25,
  },
  {
    id: 'cycle_short_trips',
    labelEn: 'Walk or cycle for errands under 2 km (on low-AQI hours)',
    labelHi: '2 किमी से कम दूरी के लिए पैदल या साइकिल चुनें (कम AQI समय में)',
    descriptionEn:
      'Replaces 5 short cold-start petrol trips/week (~2 km each) during afternoon lower-smog hours.',
    descriptionHi:
      'दोपहर के अपेक्षाकृत कम स्मॉग वाले समय में 5 छोटी दोपहिया/कार यात्राओं को पैदल या साइकिल से बदलता है।',
    approxCo2SavedGramsPerWeek: 2400,
    approxPm25ReductionFraction: 0.04,
  },
] as const;
