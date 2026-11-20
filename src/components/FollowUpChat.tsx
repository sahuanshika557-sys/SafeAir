import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import { MAX_FREE_TEXT_LENGTH } from '../constants/index.ts';
import type { TranslationDictionary } from '../i18n/translations.ts';
import { streamFollowUpChat } from '../services/gemini.ts';
import type {
  ActionPlan,
  AirQualityReading,
  ChatMessage,
  Language,
  LocationData,
} from '../types/index.ts';
import { isAbortError } from '../utils/network.ts';
import { validateChatMessage } from '../utils/validation.ts';

interface FollowUpChatProps {
  t: TranslationDictionary;
  language: Language;
  location: LocationData;
  reading: AirQualityReading | null;
  plan: ActionPlan | null;
}

/**
 * Safe follow-up chat assistant scoped strictly to air quality, health protection, and sustainability.
 * Uses react-markdown with raw HTML disabled to prevent XSS.
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

    try {
      const categoryLabel = reading
        ? language === 'hi'
          ? reading.category.labelHi
          : reading.category.labelEn
        : t.notAvailable;

      const finalText = await streamFollowUpChat({
        message: validation.sanitized,
        history: nextHistory,
        context: {
          locationName: [location.name, location.country].filter(Boolean).join(', '),
          usAqi: reading?.usAqi ?? 150,
          categoryLabel,
          planSummary: plan?.summary,
        },
        language,
        signal: controller.signal,
        onToken: (accumulated) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m)),
          );
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
                }
              : m,
          ),
        );
      }
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return;
      }
      const message = err instanceof Error ? err.message : t.chatUnavailableError;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: message, isError: true } : m)),
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
                    : 'mr-auto max-w-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
              }`}
            >
              {msg.role === 'user' ? (
                <p>{msg.content}</p>
              ) : msg.content ? (
                <div className="space-y-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5">
                  <ReactMarkdown
                    allowedElements={['p', 'ul', 'ol', 'li', 'strong', 'em', 'code']}
                    unwrapDisallowed
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
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
