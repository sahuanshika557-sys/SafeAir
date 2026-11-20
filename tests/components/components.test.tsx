import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { ActionPlanView } from '../../src/components/ActionPlanView.tsx';
import { AqiHeroCard } from '../../src/components/AqiHeroCard.tsx';
import { ErrorBoundary } from '../../src/components/ErrorBoundary.tsx';
import { FollowUpChat } from '../../src/components/FollowUpChat.tsx';
import { Header } from '../../src/components/Header.tsx';
import { ImpactCalculator } from '../../src/components/ImpactCalculator.tsx';
import { ProfileForm } from '../../src/components/ProfileForm.tsx';
import { DEFAULT_LOCATION, DEFAULT_PROFILE } from '../../src/constants/index.ts';
import { TRANSLATIONS } from '../../src/i18n/translations.ts';
import { createManualAirQualityReading } from '../../src/utils/aqi.ts';
import { buildRuleBasedFallbackPlan } from '../../src/utils/fallbackPlan.ts';

describe('SafeAir Saathi components and accessibility (jest-axe)', () => {
  it('renders Header with skip link, language toggle, and zero axe violations', async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Header t={TRANSLATIONS.en} language="en" onToggleLanguage={onToggle} />,
    );
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
    const langBtn = screen.getByRole('button', { name: TRANSLATIONS.en.languageSwitchLabel });
    await userEvent.click(langBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders AqiHeroCard with live pollutants, search submit, manual N/A fallback, and zero axe violations', async () => {
    const liveReading = {
      ...createManualAirQualityReading(185),
      pm25: 108.4,
      pm10: 162.1,
      no2: 27.8,
      o3: 112.0,
      source: 'open-meteo',
      isManual: false,
    };
    const onSelectCity = vi.fn();
    const onSubmitCitySearch = vi.fn();
    const onApplyManual = vi.fn().mockReturnValue({ success: true });
    const onGeolocate = vi.fn();

    const { container, rerender } = render(
      <AqiHeroCard
        t={TRANSLATIONS.en}
        language="en"
        location={DEFAULT_LOCATION}
        reading={liveReading}
        isLoadingAqi={false}
        aqiError={null}
        searchQuery="Lucknow"
        onSearchQueryChange={vi.fn()}
        searchResults={[
          {
            id: 'city-1',
            name: 'Lucknow',
            admin1: 'Uttar Pradesh',
            country: 'India',
            latitude: 26.8467,
            longitude: 80.9462,
            source: 'search',
          },
        ]}
        isSearching={false}
        searchError={null}
        onSelectCity={onSelectCity}
        onSubmitCitySearch={onSubmitCitySearch}
        onRequestGeolocation={onGeolocate}
        isLocating={false}
        geoError={null}
        onApplyManualAqi={onApplyManual}
        onRefreshAqi={vi.fn()}
      />,
    );

    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
    expect(screen.getByText('108.4 µg/m³')).toBeInTheDocument();
    expect(screen.getByText('27.8 µg/m³')).toBeInTheDocument();
    expect(screen.getByText('112 µg/m³')).toBeInTheDocument();
    expect(screen.getByText(/Open-Meteo Air Quality API/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /185 US AQI/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.citySearchBtn }));
    expect(onSubmitCitySearch).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /Lucknow/i }));
    expect(onSelectCity).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /Use My Location/i }));
    expect(onGeolocate).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /Enter AQI manually/i }));
    await userEvent.click(screen.getByRole('button', { name: /Apply AQI/i }));
    expect(onApplyManual).toHaveBeenCalledWith(185);

    expect(await axe(container)).toHaveNoViolations();

    // Hindi mode with manual fallback shows pure Hindi category & unavailable pollutants (no 0 µg/m³)
    const manualReading = createManualAirQualityReading(185);
    rerender(
      <AqiHeroCard
        t={TRANSLATIONS.hi}
        language="hi"
        location={DEFAULT_LOCATION}
        reading={manualReading}
        isLoadingAqi={false}
        aqiError={null}
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        searchResults={[]}
        isSearching={false}
        searchError={null}
        onSelectCity={onSelectCity}
        onSubmitCitySearch={onSubmitCitySearch}
        onRequestGeolocation={onGeolocate}
        isLocating={false}
        geoError={null}
        onApplyManualAqi={onApplyManual}
        onRefreshAqi={vi.fn()}
      />,
    );

    expect(screen.getByText('नई दिल्ली, दिल्ली, भारत')).toBeInTheDocument();
    expect(screen.getByText('अस्वस्थ')).toBeInTheDocument();
    expect(screen.queryByText(/\(Unhealthy\)/)).not.toBeInTheDocument();
    expect(screen.getAllByText('उपलब्ध नहीं')).toHaveLength(4);
    expect(screen.getByText(/मैनुअल AQI प्रविष्टि/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders ProfileForm, shows validation alert for >500 chars notes, submits valid profile, and passes axe', async () => {
    const onSubmit = vi.fn();
    let currentProfile = { ...DEFAULT_PROFILE };
    const { container, rerender } = render(
      <ProfileForm
        t={TRANSLATIONS.en}
        profile={currentProfile}
        onChange={(next) => {
          currentProfile = next;
        }}
        onSubmit={onSubmit}
        isGenerating={false}
        hasReading={true}
      />,
    );

    // Invalid >500 char notes triggers role="alert" linked by aria-describedby
    const tooLongProfile = { ...DEFAULT_PROFILE, notes: 'a'.repeat(505) };
    rerender(
      <ProfileForm
        t={TRANSLATIONS.en}
        profile={tooLongProfile}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        isGenerating={false}
        hasReading={true}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Generate Personalized Plan/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/500/);
    expect(onSubmit).not.toHaveBeenCalled();

    // Valid profile submits cleanly
    rerender(
      <ProfileForm
        t={TRANSLATIONS.en}
        profile={DEFAULT_PROFILE}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        isGenerating={false}
        hasReading={true}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Generate Personalized Plan/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders ActionPlanView tabs, medical disclaimer, error+retry fallback, and passes axe', async () => {
    const reading = createManualAirQualityReading(225);
    const plan = buildRuleBasedFallbackPlan(reading, DEFAULT_PROFILE, 'en');
    const onRetry = vi.fn();

    const { container } = render(
      <ActionPlanView
        t={TRANSLATIONS.en}
        language="en"
        plan={plan}
        isGenerating={false}
        streamCharCount={0}
        error="Temporary Gemini outage"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(TRANSLATIONS.en.medicalDisclaimerTitle)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Temporary Gemini outage');
    await userEvent.click(screen.getByRole('button', { name: /Retry AI Plan/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    const indoorTab = screen.getByRole('tab', { name: TRANSLATIONS.en.tabIndoorHacks });
    await userEvent.click(indoorTab);
    expect(indoorTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Time ventilation strictly to midday/i)).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders ImpactCalculator, updates weekly CO2 & PM2.5 estimates on toggle, and passes axe', async () => {
    const { container } = render(<ImpactCalculator t={TRANSLATIONS.en} language="en" />);
    expect(screen.getByText(/Approx\. 11\.5 kg CO₂/i)).toBeInTheDocument();

    const woodCheckbox = screen.getByRole('checkbox', {
      name: /Use Induction \/ Electric or LPG/i,
    });
    await userEvent.click(woodCheckbox);
    await waitFor(() => {
      expect(screen.getByText(/Approx\. 17\.7 kg CO₂/i)).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders FollowUpChat, validates empty submit, and passes axe', async () => {
    const reading = createManualAirQualityReading(180);
    const { container } = render(
      <FollowUpChat
        t={TRANSLATIONS.en}
        language="en"
        location={DEFAULT_LOCATION}
        reading={reading}
        plan={null}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Send/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a question/i);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('supports keyboard tab navigation and Read Aloud in ActionPlanView', async () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        public text: string;
        public lang = 'en-IN';
        public rate = 1;
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    const reading = createManualAirQualityReading(195);
    const plan = buildRuleBasedFallbackPlan(reading, DEFAULT_PROFILE, 'en');

    render(
      <ActionPlanView
        t={TRANSLATIONS.en}
        language="en"
        plan={plan}
        isGenerating={false}
        streamCharCount={0}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    const routineTab = screen.getByRole('tab', { name: TRANSLATIONS.en.tabDailyRoutine });
    routineTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: TRANSLATIONS.en.tabIndoorHacks })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: TRANSLATIONS.en.tabHealthProtection })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{Home}');
    expect(routineTab).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: TRANSLATIONS.en.tabHealthProtection })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.readAloudBtn }));
    expect(speakMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('streams FollowUpChat markdown safely without rendering raw HTML tags (XSS guard)', async () => {
    const encoder = new TextEncoder();
    const ssePayload =
      'Wear **N95** outdoors.<script>window.__xss=1</script><img src=x onerror=alert(1)>';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: ssePayload })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const reading = createManualAirQualityReading(180);
    const { container } = render(
      <FollowUpChat
        t={TRANSLATIONS.en}
        language="en"
        location={DEFAULT_LOCATION}
        reading={reading}
        plan={null}
      />,
    );

    const input = screen.getByLabelText(TRANSLATIONS.en.chatInputLabel);
    await userEvent.type(input, 'Which mask is best?');
    await userEvent.click(screen.getByRole('button', { name: TRANSLATIONS.en.chatSendBtn }));

    await waitFor(() => {
      expect(screen.getByText('N95')).toBeInTheDocument();
    });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('catches child errors in ErrorBoundary and recovers when retry is clicked', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;
    function FlakyPanel() {
      if (shouldThrow) {
        throw new Error('Render crash');
      }
      return <p>Panel recovered</p>;
    }

    render(
      <ErrorBoundary sectionTitle="Air Quality" bodyText="Panel error" retryLabel="Try Again">
        <FlakyPanel />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Panel error');
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Panel recovered')).toBeInTheDocument();
    consoleErrSpy.mockRestore();
  });
});
