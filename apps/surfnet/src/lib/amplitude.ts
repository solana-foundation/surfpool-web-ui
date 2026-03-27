import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || '';

let initialized = false;

export function initAmplitude() {
  if (initialized || typeof window === 'undefined') return;

  amplitude.init(AMPLITUDE_API_KEY, {
    defaultTracking: {
      sessions: true,
      pageViews: true,
      formInteractions: false,
      fileDownloads: false,
    },
  });
  initialized = true;
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window === 'undefined') return;
  amplitude.track(eventName, properties);
}

export function trackPageView(networkId: string, networkName: string) {
  trackEvent('surfnet_page_view', {
    network_id: networkId,
    network_name: networkName,
  });
}

export function trackExplorerClicked(networkId: string) {
  trackEvent('surfnet_explorer_clicked', { network_id: networkId });
}

export function trackPrimaryButtonClicked(networkId: string, buttonLabel: string) {
  trackEvent('surfnet_primary_button_clicked', {
    network_id: networkId,
    button_label: buttonLabel,
  });
}
