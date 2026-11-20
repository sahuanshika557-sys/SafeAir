import type {
  BudgetLevel,
  CommuteMode,
  CookingFuel,
  HomeType,
  HouseholdGroup,
  Language,
  WorkStyle,
} from '../types/index.ts';

export interface TranslationDictionary {
  skipToContent: string;
  brandName: string;
  navAriaLabel: string;
  navAirQuality: string;
  navProfile: string;
  navPlan: string;
  navImpact: string;
  navChat: string;
  languageSwitchLabel: string;
  themeToggleLight: string;
  themeToggleDark: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  citySearchLabel: string;
  citySearchPlaceholder: string;
  citySearchBtn: string;
  searchingCities: string;
  matchingCitiesLabel: string;
  cityNoResults: string;
  useMyLocation: string;
  locating: string;
  manualAqiToggle: string;
  manualAqiLabel: string;
  manualAqiApply: string;
  manualAqiHint: string;
  manualAqiRangeError: string;
  refreshReading: string;
  aqiLoading: string;
  aqiErrorTitle: string;
  aqiSourceLabel: string;
  liveAqiSource: string;
  manualAqiSource: string;
  updatedLabel: string;
  aqiScaleLabel: string;
  aqiGaugeAriaLabel: (aqi: number, categoryLabel: string) => string;
  notAvailable: string;
  unitUgM3: string;
  pollutantPm25: string;
  pollutantPm10: string;
  pollutantNo2: string;
  pollutantO3: string;
  profileTitle: string;
  profileSubtitle: string;
  householdLabel: string;
  householdOptions: Record<HouseholdGroup, string>;
  commuteLabel: string;
  commuteOptions: Record<CommuteMode, string>;
  workStyleLabel: string;
  workStyleOptions: Record<WorkStyle, string>;
  homeTypeLabel: string;
  homeTypeOptions: Record<HomeType, string>;
  purifierLabel: string;
  purifierYes: string;
  purifierNo: string;
  cookingFuelLabel: string;
  cookingFuelOptions: Record<CookingFuel, string>;
  budgetLabel: string;
  budgetOptions: Record<BudgetLevel, string>;
  notesLabel: string;
  notesPlaceholder: string;
  notesCounterSuffix: string;
  generatePlanBtn: string;
  generatingPlanBtn: string;
  planTitle: string;
  planSubtitle: string;
  medicalDisclaimerTitle: string;
  medicalDisclaimerText: string;
  bestWindowLabel: string;
  worstWindowLabel: string;
  readAloudBtn: string;
  stopReadingBtn: string;
  tabDailyRoutine: string;
  tabIndoorHacks: string;
  tabSustainable: string;
  tabHealthProtection: string;
  whyItHelpsLabel: string;
  estimatedImpactLabel: string;
  planEmptyTitle: string;
  planEmptyBody: string;
  planStreamingNotice: string;
  whyFitsTitle: string;
  planOutdatedTitle: string;
  planOutdatedBody: (place: string, aqi: number, categoryLabel: string) => string;
  regenerateForLocationBtn: string;
  geminiErrorTitle: string;
  retryBtn: string;
  fallbackBannerNotice: string;
  impactTitle: string;
  impactSubtitle: string;
  impactApproxNote: string;
  impactHowWeEstimateTitle: string;
  impactHowWeEstimateBody: string;
  co2SavedLabel: string;
  pm25ReductionLabel: string;
  perWeekSuffix: string;
  chatTitle: string;
  chatSubtitle: string;
  chatHistoryLabel: string;
  chatInputLabel: string;
  chatPlaceholder: string;
  chatSendBtn: string;
  chatSendingBtn: string;
  chatEmptyHint: string;
  chatEmptyError: string;
  chatIncompleteError: string;
  chatUnavailableError: string;
  errorBoundaryBody: string;
  errorBoundaryRetry: string;
  footerText: string;
}

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: {
    skipToContent: 'Skip to main content',
    brandName: 'SafeAir Saathi',
    navAriaLabel: 'Primary sections',
    navAirQuality: 'Air Quality',
    navProfile: 'Lifestyle',
    navPlan: 'Action Plan',
    navImpact: 'Impact',
    navChat: 'Ask Saathi',
    languageSwitchLabel: 'हिंदी में देखें',
    themeToggleLight: 'Light mode',
    themeToggleDark: 'Dark mode',
    heroEyebrow: 'Winter Smog & Urban Air Companion',
    heroTitle: 'Breathe safer with practical daily guidance tailored to your home.',
    heroSubtitle:
      'Live local air quality paired with low-emission routines, indoor air hacks, budget-matched alternatives, and honest impact estimates.',
    citySearchLabel: 'Search city or town',
    citySearchPlaceholder: 'Type a city (e.g., Delhi, Lucknow, Patna)...',
    citySearchBtn: 'Search',
    searchingCities: 'Searching cities...',
    matchingCitiesLabel: 'Matching cities',
    cityNoResults: 'No matching cities found. Try another spelling or use your location.',
    useMyLocation: 'Use My Location',
    locating: 'Locating...',
    manualAqiToggle: 'Enter AQI manually',
    manualAqiLabel: 'Manual US AQI (0–500)',
    manualAqiApply: 'Apply AQI',
    manualAqiHint: 'Use this only as a fallback if live Open-Meteo lookup is unavailable.',
    manualAqiRangeError: 'Enter an AQI between 0 and 500.',
    refreshReading: 'Refresh reading',
    aqiLoading: 'Fetching live air quality reading...',
    aqiErrorTitle: 'Live AQI lookup could not complete.',
    aqiSourceLabel: 'Source',
    liveAqiSource: 'Open-Meteo Air Quality API (CAMS / Global)',
    manualAqiSource: 'Manual AQI Entry (fallback)',
    updatedLabel: 'Updated',
    aqiScaleLabel: 'US AQI',
    aqiGaugeAriaLabel: (aqi: number, categoryLabel: string) =>
      `Air Quality Index gauge showing ${aqi} US AQI (${categoryLabel})`,
    notAvailable: 'N/A',
    unitUgM3: 'µg/m³',
    pollutantPm25: 'PM2.5',
    pollutantPm10: 'PM10',
    pollutantNo2: 'NO₂',
    pollutantO3: 'O₃',
    profileTitle: 'Household & Lifestyle Profile',
    profileSubtitle:
      'Personalize recommendations to your family needs, commute, home setup, and budget.',
    householdLabel: 'Vulnerable household members (select all that apply)',
    householdOptions: {
      children: 'Young children',
      elderly: 'Elderly (60+)',
      respiratory: 'Asthma / respiratory condition',
      pregnant: 'Pregnant member',
    },
    commuteLabel: 'Primary commute mode',
    commuteOptions: {
      walk: 'Walk',
      bike: 'Bicycle',
      bus: 'Bus',
      metro: 'Metro / Rail',
      two_wheeler: 'Two-wheeler',
      car: 'Car',
    },
    workStyleLabel: 'Work / daily schedule',
    workStyleOptions: {
      wfh: 'Work from home',
      office: 'Indoor office / school',
      outdoor: 'Outdoor work',
    },
    homeTypeLabel: 'Home type',
    homeTypeOptions: {
      apartment: 'Apartment / Flat',
      house: 'Independent house',
    },
    purifierLabel: 'Do you have a HEPA air purifier?',
    purifierYes: 'Yes',
    purifierNo: 'No',
    cookingFuelLabel: 'Primary cooking fuel',
    cookingFuelOptions: {
      lpg: 'LPG / Piped gas',
      induction: 'Induction / Electric',
      wood: 'Wood / Biomass / Coal',
      other: 'Other',
    },
    budgetLabel: 'Budget for upgrades & alternatives',
    budgetOptions: {
      low: 'Low (zero/low-cost focus)',
      medium: 'Medium',
      high: 'High',
    },
    notesLabel: 'Additional context (optional, max 500 characters)',
    notesPlaceholder: 'E.g., ground floor facing main road, child walks to school at 7:30 AM...',
    notesCounterSuffix: 'characters',
    generatePlanBtn: 'Generate Personalized Plan',
    generatingPlanBtn: 'Generating Plan...',
    planTitle: 'Your Personalized Clean-Air Plan',
    planSubtitle:
      'Four actionable areas explaining why each step helps and its approximate impact.',
    medicalDisclaimerTitle: 'Informational Guidance Only',
    medicalDisclaimerText:
      'SafeAir Saathi provides environmental and general wellness information only—not medical advice, diagnosis, or treatment. Always consult a qualified doctor for respiratory symptoms or health decisions.',
    bestWindowLabel: 'Best lower-smog window',
    worstWindowLabel: 'Peak smog window to avoid',
    readAloudBtn: 'Read aloud',
    stopReadingBtn: 'Stop reading',
    tabDailyRoutine: 'Low-Emission Routine',
    tabIndoorHacks: 'Indoor Air Hacks',
    tabSustainable: 'Sustainable Alternatives',
    tabHealthProtection: 'Health Protection',
    whyItHelpsLabel: 'Why this helps',
    estimatedImpactLabel: 'Estimated impact (approximate)',
    planEmptyTitle: 'Ready to build your plan',
    planEmptyBody:
      'Confirm your city or AQI above, adjust your household profile, and select "Generate Personalized Plan".',
    planStreamingNotice: 'Streaming personalized recommendations from Gemini...',
    whyFitsTitle: 'Why this plan fits you',
    planOutdatedTitle: 'Location, AQI, or language changed',
    planOutdatedBody: (place: string, aqi: number, categoryLabel: string) =>
      `Active reading is now ${place} (${aqi} US AQI · ${categoryLabel}). Previous AQI guidance has been hidden so outdated numbers are not shown.`,
    regenerateForLocationBtn: 'Regenerate for this location',
    geminiErrorTitle: 'Could not reach the AI plan generator.',
    retryBtn: 'Retry AI Plan',
    fallbackBannerNotice:
      'Showing an immediate rule-based safety plan based on your AQI level while AI generation is unavailable.',
    impactTitle: 'Weekly Impact Calculator',
    impactSubtitle:
      'Select everyday swaps below to see approximate weekly CO₂ savings and PM2.5 exposure reduction.',
    impactApproxNote:
      'All figures are approximate order-of-magnitude estimates for typical urban commutes.',
    impactHowWeEstimateTitle: 'How we estimate',
    impactHowWeEstimateBody:
      'Combined PM2.5 exposure drops are not added linearly: we sort selected swaps, apply a diminishing-returns factor (×0.85 per extra swap) multiplicatively, and cap total reduction at 65% because ambient winter smog still penetrates outdoors and buildings.',
    co2SavedLabel: 'Estimated CO₂ avoided',
    pm25ReductionLabel: 'Estimated PM2.5 exposure drop',
    perWeekSuffix: 'per week',
    chatTitle: 'Ask SafeAir Saathi',
    chatSubtitle:
      'Ask follow-up questions about your plan, masks, indoor air, or clean alternatives.',
    chatHistoryLabel: 'Conversation history',
    chatInputLabel: 'Your question about air quality or your plan',
    chatPlaceholder: 'E.g., Is a DIY box-fan filter safe to run overnight in a closed bedroom?',
    chatSendBtn: 'Send',
    chatSendingBtn: 'Thinking...',
    chatEmptyHint: 'Ask about ventilation timing, N95 mask fit, cooking fumes, or commute swaps.',
    chatEmptyError: 'Please enter a valid question.',
    chatIncompleteError:
      'I could not complete that reply. Please rephrase your air quality or health protection question.',
    chatUnavailableError: 'Chat is temporarily unavailable. Please try again shortly.',
    errorBoundaryBody:
      'Something went wrong while displaying this section. Please reload this panel.',
    errorBoundaryRetry: 'Try Again',
    footerText:
      'SafeAir Saathi · Built for families navigating winter smog · No cookies or location tracking.',
  },
  hi: {
    skipToContent: 'मुख्य सामग्री पर जाएँ',
    brandName: 'सेफएयर साथी',
    navAriaLabel: 'मुख्य अनुभाग',
    navAirQuality: 'वायु गुणवत्ता',
    navProfile: 'जीवनशैली',
    navPlan: 'कार्य योजना',
    navImpact: 'प्रभाव',
    navChat: 'सवाल पूछें',
    languageSwitchLabel: 'English में देखें',
    themeToggleLight: 'लाइट मोड',
    themeToggleDark: 'डार्क मोड',
    heroEyebrow: 'सर्दियों के स्मॉग और शहरी वायु प्रदूषण के लिए साथी',
    heroTitle: 'अपने घर और परिवार के अनुसार सुरक्षित व कम-प्रदूषण वाली दैनिक सलाह पाएँ।',
    heroSubtitle:
      'लाइव स्थानीय AQI के साथ कम-उत्सर्जन दिनचर्या, घर के भीतर हवा सुधारने के उपाय, बजट के अनुसार टिकाऊ विकल्प और अनुमानित प्रभाव जानें।',
    citySearchLabel: 'शहर या कस्बा खोजें',
    citySearchPlaceholder: 'शहर का नाम लिखें (जैसे दिल्ली, लखनऊ, पटना)...',
    citySearchBtn: 'खोजें',
    searchingCities: 'शहर खोजे जा रहे हैं...',
    matchingCitiesLabel: 'मिलते-जुलते शहर',
    cityNoResults: 'कोई मिलता-जुलता शहर नहीं मिला। कृपया दूसरा नाम लिखें या अपना स्थान चुनें।',
    useMyLocation: 'मेरा स्थान उपयोग करें',
    locating: 'स्थान खोजा जा रहा है...',
    manualAqiToggle: 'AQI स्वयं दर्ज करें',
    manualAqiLabel: 'मैनुअल यूएस AQI (0–500)',
    manualAqiApply: 'AQI लागू करें',
    manualAqiHint: 'यदि लाइव ओपन-मेटिओ डेटा उपलब्ध न हो तभी अंतिम विकल्प के रूप में इसका उपयोग करें।',
    manualAqiRangeError: 'कृपया 0 से 500 के बीच मान्य AQI दर्ज करें।',
    refreshReading: 'रीडिंग रीफ़्रेश करें',
    aqiLoading: 'लाइव वायु गुणवत्ता डेटा लाया जा रहा है...',
    aqiErrorTitle: 'लाइव AQI डेटा प्राप्त नहीं हो सका।',
    aqiSourceLabel: 'स्रोत',
    liveAqiSource: 'ओपन-मेटिओ वायु गुणवत्ता एपीआई (लाइव)',
    manualAqiSource: 'मैनुअल AQI प्रविष्टि (अंतिम विकल्प)',
    updatedLabel: 'अपडेट समय',
    aqiScaleLabel: 'यूएस AQI',
    aqiGaugeAriaLabel: (aqi: number, categoryLabel: string) =>
      `वायु गुणवत्ता सूचकांक मीटर: ${aqi} यूएस AQI (${categoryLabel})`,
    notAvailable: 'उपलब्ध नहीं',
    unitUgM3: 'µg/m³',
    pollutantPm25: 'PM2.5',
    pollutantPm10: 'PM10',
    pollutantNo2: 'NO₂',
    pollutantO3: 'O₃',
    profileTitle: 'परिवार और जीवनशैली प्रोफ़ाइल',
    profileSubtitle: 'अपने परिवार की ज़रूरतों, यात्रा, घर और बजट के अनुसार सलाह तैयार करें।',
    householdLabel: 'परिवार के संवेदनशील सदस्य (लागू विकल्प चुनें)',
    householdOptions: {
      children: 'छोटे बच्चे',
      elderly: 'बुजुर्ग (60+)',
      respiratory: 'दमा / सांस की समस्या',
      pregnant: 'गर्भवती महिला',
    },
    commuteLabel: 'दैनिक आवागमन का मुख्य माध्यम',
    commuteOptions: {
      walk: 'पैदल',
      bike: 'साइकिल',
      bus: 'बस',
      metro: 'मेट्रो / रेल',
      two_wheeler: 'दोपहिया वाहन',
      car: 'कार',
    },
    workStyleLabel: 'कार्य / दैनिक दिनचर्या',
    workStyleOptions: {
      wfh: 'घर से काम',
      office: 'ऑफिस / स्कूल (अंदर)',
      outdoor: 'बाहर का काम',
    },
    homeTypeLabel: 'घर का प्रकार',
    homeTypeOptions: {
      apartment: 'अपार्टमेंट / फ्लैट',
      house: 'स्वतंत्र मकान',
    },
    purifierLabel: 'क्या आपके पास HEPA एयर प्यूरीफायर है?',
    purifierYes: 'हाँ',
    purifierNo: 'नहीं',
    cookingFuelLabel: 'खाना पकाने का मुख्य ईंधन',
    cookingFuelOptions: {
      lpg: 'एलपीजी / पाइप गैस',
      induction: 'इंडक्शन / इलेक्ट्रिक',
      wood: 'लकड़ी / गोबर / कोयला',
      other: 'अन्य',
    },
    budgetLabel: 'विकल्पों के लिए बजट स्तर',
    budgetOptions: {
      low: 'कम (निःशुल्क या कम लागत)',
      medium: 'मध्यम',
      high: 'उच्च',
    },
    notesLabel: 'अतिरिक्त जानकारी (वैकल्पिक, अधिकतम 500 अक्षर)',
    notesPlaceholder: 'जैसे: मुख्य सड़क की ओर भूतल का घर, बच्चा सुबह 7:30 बजे स्कूल जाता है...',
    notesCounterSuffix: 'अक्षर',
    generatePlanBtn: 'व्यक्तिगत योजना बनाएँ',
    generatingPlanBtn: 'योजना बन रही है...',
    planTitle: 'आपकी व्यक्तिगत स्वच्छ-वायु योजना',
    planSubtitle: 'चार प्रमुख हिस्से—हर सलाह के पीछे का कारण और उसका अनुमानित प्रभाव।',
    medicalDisclaimerTitle: 'केवल जानकारी के लिए (चिकित्सा सलाह नहीं)',
    medicalDisclaimerText:
      'सेफएयर साथी केवल पर्यावरण और सामान्य स्वास्थ्य जानकारी देता है—यह चिकित्सा सलाह, निदान या उपचार नहीं है। सांस संबंधी लक्षणों के लिए हमेशा योग्य डॉक्टर से सलाह लें।',
    bestWindowLabel: 'अपेक्षाकृत बेहतर हवा का समय',
    worstWindowLabel: 'अत्यधिक स्मॉग का समय (बचें)',
    readAloudBtn: 'सुनें',
    stopReadingBtn: 'पढ़ना रोकें',
    tabDailyRoutine: 'कम-उत्सर्जन दिनचर्या',
    tabIndoorHacks: 'इनडोर हवा उपाय',
    tabSustainable: 'टिकाऊ विकल्प',
    tabHealthProtection: 'स्वास्थ्य सुरक्षा',
    whyItHelpsLabel: 'यह क्यों मदद करता है',
    estimatedImpactLabel: 'अनुमानित प्रभाव (लगभग)',
    planEmptyTitle: 'योजना बनाने के लिए तैयार',
    planEmptyBody: 'ऊपर अपना शहर या AQI चुनें, प्रोफ़ाइल भरें और "व्यक्तिगत योजना बनाएँ" दबाएँ।',
    planStreamingNotice: 'एआई से व्यक्तिगत सुझाव प्राप्त किए जा रहे हैं...',
    whyFitsTitle: 'यह योजना आपके परिवार के लिए क्यों उपयुक्त है',
    planOutdatedTitle: 'स्थान, AQI या भाषा बदल गई है',
    planOutdatedBody: (place: string, aqi: number, categoryLabel: string) =>
      `वर्तमान रीडिंग अब ${place} (${aqi} यूएस AQI · ${categoryLabel}) है। पुरानी AQI संख्या छिपा दी गई है ताकि गलत जानकारी न दिखे।`,
    regenerateForLocationBtn: 'इस स्थान के लिए पुनः योजना बनाएँ',
    geminiErrorTitle: 'एआई योजना जनरेटर से संपर्क नहीं हो सका।',
    retryBtn: 'पुनः प्रयास करें',
    fallbackBannerNotice:
      'AI सेवा उपलब्ध न होने के कारण आपके AQI स्तर पर आधारित त्वरित नियम-आधारित सुरक्षा योजना दिखाई जा रही है।',
    impactTitle: 'साप्ताहिक प्रभाव कैलकुलेटर',
    impactSubtitle: 'नीचे दैनिक बदलाव चुनें और साप्ताहिक अनुमानित CO₂ बचत व PM2.5 जोखिम कमी देखें।',
    impactApproxNote: 'सभी आंकड़े सामान्य शहरी आवागमन पर आधारित अनुमानित (लगभग) मान हैं।',
    impactHowWeEstimateTitle: 'हम यह अनुमान कैसे लगाते हैं',
    impactHowWeEstimateBody:
      'कई उपायों के PM2.5 लाभ सीधे जोड़े नहीं जाते: हम चुने गए उपायों पर घटते लाभ (प्रत्येक अतिरिक्त बदलाव पर ×0.85) के साथ गुणनात्मक गणना करते हैं और कुल कमी को अधिकतम 65% पर सीमित रखते हैं, क्योंकि बाहरी स्मॉग पूरी तरह शून्य नहीं हो सकता।',
    co2SavedLabel: 'अनुमानित CO₂ बचत',
    pm25ReductionLabel: 'अनुमानित PM2.5 जोखिम कमी',
    perWeekSuffix: 'प्रति सप्ताह',
    chatTitle: 'सेफएयर साथी से पूछें',
    chatSubtitle: 'अपनी योजना, मास्क, इनडोर हवा या स्वच्छ विकल्पों से जुड़े प्रश्न पूछें।',
    chatHistoryLabel: 'वार्तालाप इतिहास',
    chatInputLabel: 'वायु गुणवत्ता या आपकी योजना से जुड़ा प्रश्न',
    chatPlaceholder: 'जैसे: क्या बंद कमरे में रात भर DIY बॉक्स-फैन फ़िल्टर चलाना सुरक्षित है?',
    chatSendBtn: 'भेजें',
    chatSendingBtn: 'सोच रहा हूँ...',
    chatEmptyHint: 'वेंटिलेशन का समय, N95 मास्क फिटिंग, खाना पकाने के धुएं या यात्रा विकल्पों के बारे में पूछें।',
    chatEmptyError: 'कृपया एक मान्य प्रश्न दर्ज करें।',
    chatIncompleteError:
      'मैं यह उत्तर पूरा नहीं कर सका। कृपया वायु गुणवत्ता या स्वास्थ्य सुरक्षा से जुड़ा अपना प्रश्न दोबारा लिखें।',
    chatUnavailableError: 'चैट अभी अस्थायी रूप से उपलब्ध नहीं है। कृपया कुछ क्षण बाद प्रयास करें।',
    errorBoundaryBody: 'इस अनुभाग को दिखाने में समस्या आई। कृपया इस पैनल को पुनः लोड करें।',
    errorBoundaryRetry: 'पुनः प्रयास करें',
    footerText:
      'सेफएयर साथी · सर्दियों के स्मॉग में परिवारों की सहायता के लिए · कोई कुकीज़ या लोकेशन ट्रैकिंग नहीं।',
  },
};
