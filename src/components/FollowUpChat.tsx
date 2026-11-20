import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { MAX_FREE_TEXT_LENGTH } from '../constants/index.js';
import type { TranslationDictionary } from '../i18n/translations.js';
import { streamFollowUpChat } from '../services/gemini.js';
import type {
  ActionPlan,
  AirQualityReading,
  ChatMessage,
  Language,
  LocationData,
} from '../types/index.js';
import { isAbortError } from '../utils/network.js';
import { validateChatMessage } from '../utils/validation.js';
import { SafeMarkdown } from './SafeMarkdown.js';

interface FollowUpChatProps {
  t: TranslationDictionary;
  language: Language;
  location: LocationData;
  reading: AirQualityReading | null;
  plan: ActionPlan | null;
}

/**
 * Safe follow-up chat assistant scoped strictly to air quality, health protection, and sustainability.
 * Uses the custom HTML-free SafeMarkdown renderer and shows a localized Continue control when truncated.
 */
export function FollowUpChat({
  t,
  language,
  location,
  reading,
  plan,
}: FollowUpChatProps): ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return (): void => {
      abortRef.current?.abort();
    };
  }, []);

  const buildChatContext = () => {
    const categoryLabel = reading
      ? language === 'hi'
        ? reading.category.labelHi
        : reading.category.labelEn
      : t.notAvailable;
    return {
      locationName: [location.name, location.country].filter(Boolean).join(', '),
      usAqi: reading?.usAqi ?? 150,
      categoryLabel,
      planSummary: plan?.summary,
    };
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const validation = validateChatMessage(input, language);
    if (!validation.valid) {
      setInputError(validation.error ?? t.chatEmptyError);
      return;
    }

    setInputError(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: validation.sanitized,
      timestamp: new Date().toISOString(),
    };
    const assistantId = `a-${Date.now()}`;
    const placeholderAssistant: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, placeholderAssistant]);
    setInput('');
    setIsStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let completedTruncated = false;

    try {
      const finalText = await streamFollowUpChat({
        message: validation.sanitized,
        history: nextHistory,
        context: buildChatContext(),
        language,
        signal: controller.signal,
        onToken: (accumulated) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m)),
          );
        },
        onComplete: ({ truncated }) => {
          completedTruncated = truncated;
        },
      });

      if (!finalText.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: t.chatIncompleteError,
                  isError: true,
                  isTruncated: false,
                }
              : m,
          ),
        );
      } else if (completedTruncated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isTruncated: true } : m)),
        );
      }
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return;
      }
      const message = err instanceof Error ? err.message : t.chatUnavailableError;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: message, isError: true, isTruncated: false } : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleContinueMessage = async (targetMsgId: string): Promise<void> => {
    const targetIdx = messages.findIndex((m) => m.id === targetMsgId);
    if (targetIdx === -1 || isStreaming) {
      return;
    }

    const baseContent = messages[targetIdx].content;
    const historyUpToMessage = messages.slice(0, targetIdx + 1);
    setIsStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let continuationTruncated = false;

    try {
      const joinPrefix = baseContent && !baseContent.endsWith('\n') ? '\n\n' : '';
      const continuationText = await streamFollowUpChat({
        message: t.chatContinuePrompt,
        history: historyUpToMessage,
        context: buildChatContext(),
        language,
        signal: controller.signal,
        onToken: (accumulated) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetMsgId
                ? {
                    ...m,
                    content: `${baseContent}${accumulated ? `${joinPrefix}${accumulated}` : ''}`,
                  }
                : m,
            ),
          );
        },
        onComplete: ({ truncated }) => {
          continuationTruncated = truncated;
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === targetMsgId
            ? {
                ...m,
                content: `${baseContent}${continuationText.trim() ? `${joinPrefix}${continuationText}` : ''}`,
                isTruncated: continuationTruncated,
              }
            : m,
        ),
      );
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return;
      }
      const errMsg = err instanceof Error ? err.message : t.chatUnavailableError;
      setMessages((prev) =>
        prev
          .map((m) => (m.id === targetMsgId ? { ...m, isTruncated: false } : m))
          .concat({
            id: `a-err-${Date.now()}`,
            role: 'assistant',
            content: errMsg,
            timestamp: new Date().toISOString(),
            isError: true,
          }),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <section
      id="ask-saathi"
      aria-labelledby="chat-section-heading"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-8 space-y-5"
    >
      <div>
        <h2
          id="chat-section-heading"
          className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100"
        >
          {t.chatTitle}
        </h2>
        <p className="mt-1 text-sm sm:text-base text-slate-600 dark:text-slate-300">
          {t.chatSubtitle}
        </p>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={t.chatHistoryLabel}
        className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 min-h-[160px] max-h-[420px] overflow-y-auto"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">{t.chatEmptyHint}</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg p-3.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'ml-auto max-w-2xl bg-teal-800 text-white dark:bg-teal-700'
                  : msg.isError
                    ? 'mr-auto max-w-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-100'
                    : 'mr-auto max-w-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 space-y-2.5'
              }`}
            >
              {msg.role === 'user' ? (
                <p>{msg.content}</p>
              ) : msg.content ? (
                <>
                  <SafeMarkdown text={msg.content} />
                  {msg.isTruncated && !msg.isError && !isStreaming && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {t.chatTruncatedNotice}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleContinueMessage(msg.id)}
                        aria-label={t.chatShowMoreLabel}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-teal-700 dark:border-teal-500 px-3.5 py-2 text-xs font-semibold text-teal-800 dark:text-teal-200 hover:bg-teal-50 dark:hover:bg-teal-950/60 transition-colors"
                      >
                        {t.chatContinueBtn}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-600 dark:text-slate-400">{t.chatSendingBtn}</p>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="chat-question-input"
            className="block text-sm font-semibold text-slate-800 dark:text-slate-200"
          >
            {t.chatInputLabel}
          </label>
          <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {input.length}/{MAX_FREE_TEXT_LENGTH}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="chat-question-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.chatPlaceholder}
            aria-invalid={Boolean(inputError)}
            aria-describedby={inputError ? 'chat-input-error' : undefined}
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-600 dark:placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={isStreaming}
            aria-busy={isStreaming}
            className="inline-flex min-h-[44px] min-w-[96px] items-center justify-center rounded-lg bg-teal-800 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-700 dark:hover:bg-teal-600 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {isStreaming ? t.chatSendingBtn : t.chatSendBtn}
          </button>
        </div>

        {inputError && (
          <p
            id="chat-input-error"
            role="alert"
            className="text-sm font-medium text-red-700 dark:text-red-300"
          >
            {inputError}
          </p>
        )}
      </form>
    </section>
  );
}

export default FollowUpChat;
