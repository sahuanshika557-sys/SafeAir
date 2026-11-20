import type { Language, RecommendationItem } from '../types/index.js';

/**
 * Identifier for scientific accuracy claim categories guarded on AI outputs.
 */
export type ScientificClaimFlag =
  'houseplant_air_purification' | 'unrealistic_filtration_claim' | 'cloth_mask_pm25_claim';

/**
 * Result returned after checking and sanitizing AI text for scientific accuracy.
 */
export interface ScientificCheckResult {
  text: string;
  flaggedClaims: ScientificClaimFlag[];
}

/**
 * Result returned after checking and sanitizing a structured action plan payload.
 */
export interface ScientificPlanCheckResult<T> {
  plan: T;
  flaggedClaims: ScientificClaimFlag[];
}

interface ClaimRule {
  flag: ScientificClaimFlag;
  pattern: RegExp;
  replacementEn: string;
  replacementHi: string;
}

const HOUSEPLANT_NEGATION_PATTERN =
  /\b(do not|don't|does not|doesn't|cannot|can't|not|no)\b[^.!?\n]{0,60}\b(purify|clean|filter|remove|reduce)\b|(?:नहीं\s+(?:करते|हटाते|साफ़\s+करते|रोकते)|मदद\s+नहीं)/i;

const SCIENTIFIC_CLAIM_RULES: readonly ClaimRule[] = [
  {
    flag: 'houseplant_air_purification',
    pattern:
      /(?:(?:[^.!?।\n;]|\d\.\d)*\b(?:houseplants?|indoor\s+plants?|snake\s+plants?|spider\s+plants?|areca\s+palms?|peace\s+lil(?:y|ies)|money\s+plants?|aloe\s+vera|boston\s+ferns?)\b(?:[^.!?।\n;]|\d\.\d)*\b(?:purif(?:y|ies|ying)|clean(?:s|ing)?|filter(?:s|ing)?|remove(?:s|ing)?|absorb(?:s|ing)?|reduce(?:s|ing)?)\b(?:[^.!?।\n;]|\d\.\d)*(?:air|pm\s*2\.5|pm25|smog|pollut\w*|toxins?|aqi)?(?:[^.!?।\n;]|\d\.\d)*[.!?]?|(?:(?!और\s+(?:कपड़|रुमाल|दुपट्टा|100|99))[^.!?।\n;]|\d\.\d)*(?:घर\s+के\s+पौधे|इनडोर\s+पौधे|स्नेक\s+प्लांट|एरेका\s+पाम|मनी\s+प्लांट)(?:(?!और\s+(?:कपड़|रुमाल|दुपट्टा|100|99))[^.!?।\n;]|\d\.\d)*(?:हवा\s*(?:को\s*)?(?:साफ़|शुद्ध)|प्रदूषण|पीएम\s*2\.5|PM2\.5|स्मॉग)(?:(?!और\s+(?:कपड़|रुमाल|दुपट्टा|100|99))[^.!?।\n;]|\d\.\d)*(?:साफ़|शुद्ध|कम|हटा|अवशोषित)?(?:(?!और\s+(?:कपड़|रुमाल|दुपट्टा|100|99))[^.!?।\n;]|\d\.\d)*[।.!?]?)/gi,
    replacementEn:
      'Houseplants do not meaningfully remove PM2.5 or winter smog indoors; use a HEPA purifier or MERV-13 DIY box-fan filter, seal window gaps, avoid indoor smoke sources, and time ventilation to lower-AQI afternoon hours.',
    replacementHi:
      'घरेलू पौधे घर के भीतर PM2.5 या स्मॉग को प्रभावी ढंग से नहीं हटाते; इसके बजाय HEPA प्यूरीफायर या MERV-13 DIY बॉक्स-फैन फ़िल्टर चलाएँ, खिड़की की दरारें सील करें, धुएँ के स्रोतों से बचें और कम-AQI समय में वेंटिलेशन करें।',
  },
  {
    flag: 'unrealistic_filtration_claim',
    pattern:
      /(?:(?:[^.!?।\n]|\d\.\d)*\b(?:100|99\.9+)\s*%(?:[^.!?।\n]|\d\.\d){0,45}(?:filtration|air\s+pollution|smog|pm\s*2\.5|pm25|toxins?|particles?|smoke|indoor\s+air)(?:[^.!?।\n]|\d\.\d)*[.!?]?|(?:[^.!?।\n]|\d\.\d)*(?:eliminat\w*|remov\w*|purif\w*|clean\w*|block\w*|filter\w*|stop\w*)(?:[^.!?।\n]|\d\.\d){0,30}\b(?:100|99\.9+)\s*%(?:[^.!?।\n]|\d\.\d)*[.!?]?|(?:[^.!?।\n]|\d\.\d)*(?:100|99\.9+)\s*%(?:[^.!?।\n]|\d\.\d){0,30}(?:प्रदूषण|स्मॉग|PM2\.5|कण|धुआँ)(?:[^.!?।\n]|\d\.\d)*[।.!?]?)/gi,
    replacementEn:
      'No indoor measure eliminates 100% of winter smog; combining sealed window gaps, source control, and HEPA filtration substantially lowers exposure.',
    replacementHi:
      'कोई भी घरेलू उपाय 100% स्मॉग को पूरी तरह खत्म नहीं करता; खिड़कियाँ सील करने, धुएँ के स्रोत रोकने और HEPA फ़िल्ट्रेशन से जोखिम काफी कम होता है।',
  },
  {
    flag: 'cloth_mask_pm25_claim',
    pattern:
      /(?:(?:[^.!?।\n]|\d\.\d)*\b(?:cloth\s+masks?|bandanas?|handkerchiefs?|scarf|scarves|dupatta)\b(?:[^.!?।\n]|\d\.\d)*(?:blocks?|filters?|stops?|protects?\s+against)\s+(?:most|all|9\d%|pm\s*2\.5|fine\s+particles|smog)(?:[^.!?।\n]|\d\.\d)*[.!?]?|(?:[^.!?।\n]|\d\.\d)*(?:कपड़े\s+का\s+मास्क|रुमाल|दुपट्टा)(?:[^.!?।\n]|\d\.\d)*(?:PM2\.5|सूक्ष्म\s+कण|स्मॉग|9\d%)(?:[^.!?।\n]|\d\.\d)*(?:रोक|छान|बचा)(?:[^.!?।\n]|\d\.\d)*[।.!?]?)/gi,
    replacementEn:
      'Cloth masks and scarves do not reliably filter fine PM2.5 particles; choose a snug, well-fitted N95/FFP2 respirator outdoors.',
    replacementHi:
      'कपड़े के मास्क या रुमाल सूक्ष्म PM2.5 कणों को प्रभावी ढंग से नहीं रोकते; बाहर अच्छी फिटिंग वाला N95/FFP2 मास्क पहनें।',
  },
];

function containsNegatedHonestPlantNote(sentence: string): boolean {
  return HOUSEPLANT_NEGATION_PATTERN.test(sentence);
}

/**
 * Checks free-form AI text (e.g., follow-up chat answers) for scientifically unsupported claims
 * such as houseplants purifying indoor PM2.5 or unrealistic filtration percentages, and replaces
 * flagged claims with accurate guidance in the active UI language.
 *
 * @param text - Raw assistant response text.
 * @param language - Target UI language (`'en'` or `'hi'`).
 * @returns Sanitized text plus list of triggered claim flags.
 */
export function sanitizeChatScientificClaims(
  text: string,
  language: Language,
): ScientificCheckResult {
  if (!text) {
    return { text: '', flaggedClaims: [] };
  }

  let updated = text;
  const flagged = new Set<ScientificClaimFlag>();

  for (const rule of SCIENTIFIC_CLAIM_RULES) {
    const replacement = language === 'hi' ? rule.replacementHi : rule.replacementEn;
    let usedReplacement = false;

    updated = updated.replace(rule.pattern, (match) => {
      if (rule.flag === 'houseplant_air_purification' && containsNegatedHonestPlantNote(match)) {
        return match;
      }
      flagged.add(rule.flag);
      if (usedReplacement) {
        return '';
      }
      usedReplacement = true;
      return replacement;
    });
  }

  const normalized = updated
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    text: normalized,
    flaggedClaims: Array.from(flagged),
  };
}

interface ActionPlanLike {
  summary: string;
  bestTimeWindow: string;
  worstTimeWindow: string;
  dailyRoutine: RecommendationItem[];
  indoorAirHacks: RecommendationItem[];
  sustainableAlternatives: RecommendationItem[];
  healthProtection: RecommendationItem[];
}

/**
 * Checks and sanitizes all recommendation items and summary fields in a structured AI plan
 * so scientifically inaccurate claims never reach users.
 *
 * @param plan - Validated 4-section plan object.
 * @param language - Target UI language (`'en'` or `'hi'`).
 * @returns Sanitized plan object and list of any triggered scientific claim flags.
 */
export function sanitizePlanScientificClaims<T extends ActionPlanLike>(
  plan: T,
  language: Language,
): ScientificPlanCheckResult<T> {
  const flags = new Set<ScientificClaimFlag>();

  const cleanField = (value: string, itemFlags?: Set<ScientificClaimFlag>): string => {
    const res = sanitizeChatScientificClaims(value, language);
    for (const f of res.flaggedClaims) {
      flags.add(f);
      itemFlags?.add(f);
    }
    return res.text;
  };

  const cleanItems = (items: RecommendationItem[]): RecommendationItem[] =>
    items.map((item) => {
      const itemFlags = new Set<ScientificClaimFlag>();
      let title = cleanField(item.title, itemFlags);
      const detail = cleanField(item.detail, itemFlags);
      const whyItHelps = cleanField(item.whyItHelps, itemFlags);
      const estimatedImpact = cleanField(item.estimatedImpact, itemFlags);
      const timeWindow = item.timeWindow ? cleanField(item.timeWindow, itemFlags) : undefined;

      if (
        itemFlags.has('houseplant_air_purification') &&
        /(?:plant|पौध)/i.test(title) &&
        !/HEPA/i.test(title)
      ) {
        title =
          language === 'hi'
            ? 'HEPA या MERV-13 DIY फ़िल्ट्रेशन अपनाएँ'
            : 'Use HEPA or MERV-13 DIY box-fan filtration';
      } else if (
        itemFlags.has('cloth_mask_pm25_claim') &&
        /(?:cloth|scarf|handkerchief|कपड़|रुमाल)/i.test(title) &&
        !/N95/i.test(title)
      ) {
        title =
          language === 'hi'
            ? 'सही फिटिंग वाला N95/FFP2 मास्क पहनें'
            : 'Wear a well-fitted N95/FFP2 respirator';
      }

      return {
        ...item,
        title,
        detail,
        whyItHelps,
        estimatedImpact,
        ...(timeWindow ? { timeWindow } : {}),
      };
    });

  const cleanedPlan: T = {
    ...plan,
    summary: cleanField(plan.summary),
    dailyRoutine: cleanItems(plan.dailyRoutine),
    indoorAirHacks: cleanItems(plan.indoorAirHacks),
    sustainableAlternatives: cleanItems(plan.sustainableAlternatives),
    healthProtection: cleanItems(plan.healthProtection),
  };

  return {
    plan: cleanedPlan,
    flaggedClaims: Array.from(flags),
  };
}
