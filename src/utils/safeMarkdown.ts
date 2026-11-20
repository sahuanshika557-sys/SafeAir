/**
 * Inline markdown node representing plain text, bold, italic, or line breaks.
 * Never holds raw HTML or `dangerouslySetInnerHTML` strings.
 */
export type MarkdownInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: MarkdownInlineNode[] }
  | { type: 'em'; children: MarkdownInlineNode[] }
  | { type: 'br' };

/**
 * Block markdown node supporting only paragraphs, unordered lists, and ordered lists.
 */
export type MarkdownBlockNode =
  | { type: 'paragraph'; children: MarkdownInlineNode[] }
  | { type: 'ul'; items: MarkdownInlineNode[][] }
  | { type: 'ol'; items: MarkdownInlineNode[][] };

const ORDERED_LIST_RE = /^\s*(?:\d+|[\u0966-\u096F]+)[.)]\s+(.*)$/;
const UNORDERED_LIST_RE = /^\s*(?:[-*•])\s+(.*)$/;

/**
 * Normalizes malformed AI markdown markers while preserving plain language text (including Hindi).
 * Specifically fixes padded bold markers such as `"** text:**"` -> `"**text:**"`, removes empty
 * `****` sequences, and strips stray unmatched `**` markers so literal `**` never leaks into UI copy.
 *
 * @param input - Raw markdown text returned by Gemini.
 * @returns Normalized markdown string safe for strict subset parsing.
 */
export function normalizeMarkdownText(input: string): string {
  if (!input) {
    return '';
  }

  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const normalizedLines = lines.map((line) => {
    // Collapse empty bold pairs such as "** **" or "****"
    let out = line.replace(/\*\*\s*\*\*/g, '');

    // Trim leading/trailing spaces inside paired **...** markers on the same line
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, (_full, inner: string) => {
      const trimmed = inner.trim();
      return trimmed ? `**${trimmed}**` : '';
    });

    // If a line still has an odd count of ** markers (e.g. cut mid-stream or half-rendered "**text"),
    // strip the unmatched stray ** so literal "**" never leaks into user text.
    const matches = out.match(/\*\*/g);
    if (matches && matches.length % 2 === 1) {
      const lastIdx = out.lastIndexOf('**');
      if (lastIdx !== -1) {
        out = out.slice(0, lastIdx) + out.slice(lastIdx + 2);
      }
    }

    return out;
  });

  return normalizedLines.join('\n').trim();
}

/**
 * Parses inline formatting (`**bold**`, `*italic*`, `_italic_`, and line breaks) into safe nodes.
 * Works seamlessly across Latin, Devanagari (Hindi), and mixed technical strings (`PM2.5`, `N95`).
 *
 * @param text - Normalized single block or line string.
 * @returns Ordered array of {@link MarkdownInlineNode} elements.
 */
export function parseInlineMarkdown(text: string): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = [];
  let cursor = 0;

  const pushText = (chunk: string): void => {
    if (!chunk) {
      return;
    }
    const last = nodes[nodes.length - 1];
    if (last && last.type === 'text') {
      last.value += chunk;
    } else {
      nodes.push({ type: 'text', value: chunk });
    }
  };

  while (cursor < text.length) {
    if (text[cursor] === '\n') {
      nodes.push({ type: 'br' });
      cursor += 1;
      continue;
    }

    // 1. Bold: **...**
    if (text.startsWith('**', cursor)) {
      const closeIdx = text.indexOf('**', cursor + 2);
      if (closeIdx > cursor + 2) {
        const inner = text.slice(cursor + 2, closeIdx);
        if (!inner.includes('\n')) {
          nodes.push({
            type: 'strong',
            children: parseInlineMarkdown(inner),
          });
          cursor = closeIdx + 2;
          continue;
        }
      }
      // Stray unmatched ** should not appear literally
      cursor += 2;
      continue;
    }

    // 2. Italic with single asterisk: *...*
    if (text[cursor] === '*' && text[cursor + 1] !== '*') {
      const closeIdx = text.indexOf('*', cursor + 1);
      if (closeIdx > cursor + 1) {
        const inner = text.slice(cursor + 1, closeIdx);
        if (!inner.includes('\n') && !inner.startsWith(' ') && !inner.endsWith(' ')) {
          nodes.push({
            type: 'em',
            children: parseInlineMarkdown(inner),
          });
          cursor = closeIdx + 1;
          continue;
        }
      }
      pushText('*');
      cursor += 1;
      continue;
    }

    // 3. Italic with underscore: _..._ (only on word boundaries so snake_case identifiers stay intact)
    if (text[cursor] === '_') {
      const prevChar = cursor > 0 ? text[cursor - 1] : '';
      const isLeftBoundary = !prevChar || /[\s([{'"“‘]/.test(prevChar);
      if (isLeftBoundary) {
        const closeIdx = text.indexOf('_', cursor + 1);
        const nextChar = closeIdx !== -1 ? text[closeIdx + 1] : '';
        const isRightBoundary =
          closeIdx > cursor + 1 && (!nextChar || /[\s.,!?;:)\]}'"”’।]/.test(nextChar));
        if (isRightBoundary) {
          const inner = text.slice(cursor + 1, closeIdx);
          if (!inner.includes('\n') && inner.trim().length > 0) {
            nodes.push({
              type: 'em',
              children: parseInlineMarkdown(inner),
            });
            cursor = closeIdx + 1;
            continue;
          }
        }
      }
      pushText('_');
      cursor += 1;
      continue;
    }

    // Advance until next potential marker for efficiency
    let nextMarker = cursor + 1;
    while (
      nextMarker < text.length &&
      text[nextMarker] !== '*' &&
      text[nextMarker] !== '_' &&
      text[nextMarker] !== '\n'
    ) {
      nextMarker += 1;
    }
    pushText(text.slice(cursor, nextMarker));
    cursor = nextMarker;
  }

  return nodes;
}

/**
 * Parses safe markdown into structured block AST nodes supporting only:
 * - Bold (`**text**`)
 * - Italic (`*text*`, `_text_`)
 * - Unordered lists (`- `, `* `, `• `)
 * - Ordered lists (`1. `, `2. `)
 * - Paragraphs and single line breaks (`\n`)
 *
 * Raw HTML tags are treated as plain text and rendered escaped by React without `dangerouslySetInnerHTML`.
 *
 * @param raw - Raw markdown response string.
 * @returns Array of {@link MarkdownBlockNode} items ready for React rendering.
 */
export function parseSafeMarkdown(raw: string): MarkdownBlockNode[] {
  const normalized = normalizeMarkdownText(raw);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  const blocks: MarkdownBlockNode[] = [];
  let paragraphLines: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({
      type: 'paragraph',
      children: parseInlineMarkdown(paragraphLines.join('\n')),
    });
    paragraphLines = [];
  };

  const flushList = (): void => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({
      type: listType,
      items: listItems.map((item) => parseInlineMarkdown(item)),
    });
    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const orderedMatch = trimmed.match(ORDERED_LIST_RE);
    if (orderedMatch) {
      flushParagraph();
      if (listType === 'ul') {
        flushList();
      }
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      continue;
    }

    const unorderedMatch = trimmed.match(UNORDERED_LIST_RE);
    if (unorderedMatch) {
      flushParagraph();
      if (listType === 'ol') {
        flushList();
      }
      listType = 'ul';
      listItems.push(unorderedMatch[1]);
      continue;
    }

    // Continuation line inside an active list or plain paragraph line
    if (listType && listItems.length > 0 && /^\s{2,}/.test(line)) {
      listItems[listItems.length - 1] += `\n${trimmed}`;
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}
