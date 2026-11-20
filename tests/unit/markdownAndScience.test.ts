import { describe, expect, it } from 'vitest';
import type { ActionPlan } from '../../src/types/index.js';
import {
  buildChatSystemInstruction,
  buildPlanSystemInstruction,
} from '../../src/utils/promptBuilder.js';
import { normalizeMarkdownText, parseSafeMarkdown } from '../../src/utils/safeMarkdown.js';
import {
  sanitizeChatScientificClaims,
  sanitizePlanScientificClaims,
} from '../../src/utils/scientificFilter.js';

describe('Safe markdown parser and normalizer', () => {
  it('normalizes stray markers like "** text:**" and strips unmatched "**"', () => {
    const messy = '** Indoor air:** Keep windows shut.\nUnclosed **bold phrase here';
    const normalized = normalizeMarkdownText(messy);
    expect(normalized).toContain('**Indoor air:**');
    expect(normalized).not.toContain('** Indoor');
    expect(normalized).not.toContain('**bold phrase');
  });

  it('parses bold, italic, line breaks, and ordered/unordered lists in English and Hindi', () => {
    const sample = [
      '**Morning Routine:** Stay indoors early morning.',
      'Use *fitted N95* outside.',
      '',
      '- **HEPA purifier:** Run on medium speed.',
      '• **सुबह की सावधानी:** खिड़कियाँ *सुबह 6-9 बजे* बंद रखें।',
      '',
      '1. पहला कदम: घर में गीला पोंछा लगाएँ।',
      '2. दूसरा कदम: बाहर जाते समय **N95 मास्क** पहनें।',
    ].join('\n');

    const blocks = parseSafeMarkdown(sample);
    expect(blocks[0].type).toBe('paragraph');
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].children).toContainEqual({
        type: 'strong',
        children: [{ type: 'text', value: 'Morning Routine:' }],
      });
      expect(blocks[0].children).toContainEqual({ type: 'br' });
      expect(blocks[0].children).toContainEqual({
        type: 'em',
        children: [{ type: 'text', value: 'fitted N95' }],
      });
    }

    expect(blocks[1]).toMatchObject({ type: 'ul' });
    if (blocks[1].type === 'ul') {
      expect(blocks[1].items).toHaveLength(2);
      expect(blocks[1].items[1][0]).toEqual({
        type: 'strong',
        children: [{ type: 'text', value: 'सुबह की सावधानी:' }],
      });
      expect(blocks[1].items[1][2]).toEqual({
        type: 'em',
        children: [{ type: 'text', value: 'सुबह 6-9 बजे' }],
      });
    }

    expect(blocks[2]).toMatchObject({ type: 'ol' });
    if (blocks[2].type === 'ol') {
      expect(blocks[2].items).toHaveLength(2);
      expect(blocks[2].items[1]).toContainEqual({
        type: 'strong',
        children: [{ type: 'text', value: 'N95 मास्क' }],
      });
    }
  });

  it('preserves underscores inside technical words and handles empty text cleanly', () => {
    expect(parseSafeMarkdown('   ')).toEqual([]);
    const blocks = parseSafeMarkdown('Check pm2_5_avg and _important_ note.');
    expect(blocks).toHaveLength(1);
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].children).toContainEqual({ type: 'text', value: 'Check pm2_5_avg and ' });
      expect(blocks[0].children).toContainEqual({
        type: 'em',
        children: [{ type: 'text', value: 'important' }],
      });
    }
  });
});

describe('Scientific accuracy filter & prompt instructions', () => {
  it('rewrites false houseplant, 100% filtration, and cloth-mask PM2.5 claims in EN & HI', () => {
    const enChat = sanitizeChatScientificClaims(
      'Put snake plants in your bedroom to purify PM2.5. Also cloth masks block PM2.5 completely. This achieves 100% filtration indoors.',
      'en',
    );
    expect(enChat.flaggedClaims).toContain('houseplant_air_purification');
    expect(enChat.flaggedClaims).toContain('unrealistic_filtration_claim');
    expect(enChat.flaggedClaims).toContain('cloth_mask_pm25_claim');
    expect(enChat.text).toContain('HEPA');
    expect(enChat.text).toContain('N95');
    expect(enChat.text).not.toContain('100% filtration');

    const hiChat = sanitizeChatScientificClaims(
      'घर में स्नेक प्लांट हवा शुद्ध करते हैं और कपड़े का मास्क PM2.5 रोकता है। यह 100% प्रदूषण हटाता है।',
      'hi',
    );
    expect(hiChat.flaggedClaims).toContain('houseplant_air_purification');
    expect(hiChat.flaggedClaims).toContain('unrealistic_filtration_claim');
    expect(hiChat.flaggedClaims).toContain('cloth_mask_pm25_claim');
    expect(hiChat.text).toContain('HEPA');
    expect(hiChat.text).toContain('N95');
  });

  it('preserves scientifically accurate negation sentences untouched', () => {
    const honest =
      'Houseplants do not meaningfully purify indoor PM2.5 during winter smog; rely on HEPA filtration instead.';
    const result = sanitizeChatScientificClaims(honest, 'en');
    expect(result.flaggedClaims).toEqual([]);
    expect(result.text).toBe(honest);

    const honestHi =
      'इंडोर पौधे सर्दियों के स्मॉग या PM2.5 को साफ नहीं करते हैं; इसके बजाय HEPA एयर प्यूरीफायर उपयोग करें।';
    const hiResult = sanitizeChatScientificClaims(honestHi, 'hi');
    expect(hiResult.flaggedClaims).toEqual([]);
    expect(hiResult.text).toBe(honestHi);
  });

  it('sanitizes inaccurate claims inside structured ActionPlan JSON in EN and HI', () => {
    const plan: ActionPlan = {
      summary: 'Summary',
      bestTimeWindow: '1 PM - 4 PM',
      worstTimeWindow: '6 AM - 9 AM',
      generatedAt: '2026-11-20T10:00:00.000Z',
      isFallback: false,
      dailyRoutine: [
        {
          title: 'Midday errands',
          detail: 'Run errands at noon.',
          whyItHelps: 'Mixing height rises.',
          estimatedImpact: '20% lower exposure',
        },
      ],
      indoorAirHacks: [
        {
          title: 'Add bedroom plants',
          detail: 'Place areca palms and snake plants to clean indoor smog.',
          whyItHelps: 'Removes 99.99% of room toxins.',
          estimatedImpact: '15% cleaner air',
        },
      ],
      sustainableAlternatives: [
        {
          title: 'Metro ride',
          detail: 'Take metro instead of car.',
          whyItHelps: 'Cuts tailpipe PM2.5.',
          estimatedImpact: '11.5 kg CO2 saved/week',
        },
      ],
      healthProtection: [
        {
          title: 'Use a scarf or cloth mask',
          detail: 'Cover nose with a wet cloth mask to filter PM2.5.',
          whyItHelps: 'Stops 100% of smog particles.',
          estimatedImpact: '30% lower inhalation',
        },
      ],
    };

    const sanitized = sanitizePlanScientificClaims(plan, 'en');
    expect(sanitized.flaggedClaims.length).toBeGreaterThan(0);
    expect(sanitized.plan.indoorAirHacks[0].title).toContain('HEPA');
    expect(sanitized.plan.indoorAirHacks[0].whyItHelps).not.toContain('99.99%');
    expect(sanitized.plan.healthProtection[0].title).toContain('N95');
    expect(sanitized.plan.healthProtection[0].whyItHelps).not.toContain(
      'Stops 100% of smog particles',
    );
  });

  it('embeds LANGUAGE LOCK, COMPLETENESS RULE, and scientific accuracy rules in prompts', () => {
    const planInstrHi = buildPlanSystemInstruction('hi');
    const chatInstrHi = buildChatSystemInstruction('hi');
    expect(planInstrHi).toContain('LANGUAGE LOCK');
    expect(planInstrHi).toContain('STRICT HOUSEPLANT RULE');
    expect(planInstrHi).toContain('Devanagari script');
    expect(chatInstrHi).toContain('LANGUAGE LOCK');
    expect(chatInstrHi).toContain('COMPLETENESS RULE');
    expect(chatInstrHi).toContain('SCIENTIFIC ACCURACY RULE');

    const chatInstrEn = buildChatSystemInstruction('en');
    expect(chatInstrEn).toContain('strictly in English');
  });
});
