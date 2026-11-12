import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

const EAS_PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NotificationDestination =
  | { screen: 'chat'; ticker?: string; filing?: string }
  | { screen: 'company'; ticker: string }
  | { screen: 'alert'; alert: string };

export class PushRegistrationError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'PushRegistrationError';
  }
}

export const PUSH_ENVIRONMENT_HINT =
  'Requires an EAS development, preview, or production build. Push works on physical devices, Android emulators with Google Play services, and iOS simulators on supported Xcode/iOS versions.';

export function getExpoProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: unknown } }
    | undefined;
  const candidates = [extra?.eas?.projectId, Constants.easConfig?.projectId];
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && EAS_PROJECT_ID.test(candidate),
  ) ?? null;
}

export async function registerForPushNotifications(): Promise<string> {
  if (Platform.OS === 'web') {
    throw new PushRegistrationError('Mobile push registration is only available on Android and iOS.');
  }

  if (Platform.OS === 'android' && Constants.expoGoConfig) {
    throw new PushRegistrationError(
      'Remote notifications are unavailable in Expo Go on Android. Install an EAS development build, then try again.',
    );
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new PushRegistrationError(
      'This build is not linked to an Expo project. Run “npx eas-cli@latest init”, rebuild the app, then try again.',
    );
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FINN alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let permission = existing;
  if (!existing.granted && existing.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    throw new PushRegistrationError(
      permission.canAskAgain
        ? 'Notification permission was not granted. Tap the button to try again.'
        : 'Notifications are blocked in system settings. Enable them for FINN, then tap the button again.',
    );
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) {
      throw new Error('Expo returned an empty push token');
    }
    return token;
  } catch (error) {
    const environment = Device.isDevice
      ? ''
      : Platform.OS === 'android'
        ? ' Ensure this emulator includes Google Play services.'
        : ' Ensure the simulator uses iOS 16+ with Xcode 14+.';
    throw new PushRegistrationError(
      `Could not obtain an Expo push token.${environment} Check the network connection and tap to retry.${
        error instanceof Error ? ` (${error.message})` : ''
      }`,
    );
  }
}

export function parseNotificationDestination(
  data: Record<string, unknown>,
): NotificationDestination | null {
  const directAlert = readPositiveInteger(data.alertId ?? data.alert_id);
  if (directAlert) return { screen: 'alert', alert: directAlert };

  const rawUrl = typeof data.url === 'string' ? data.url.trim() : '';
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl, 'https://finn.local');
  } catch {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  if (path === '/chat') {
    const ticker = cleanTicker(parsed.searchParams.get('ticker'));
    const filing = readPositiveInteger(parsed.searchParams.get('filing'));
    return { screen: 'chat', ...(ticker ? { ticker } : {}), ...(filing ? { filing } : {}) };
  }

  const companyMatch = path.match(/^\/company\/([^/]+)$/);
  if (companyMatch) {
    const ticker = cleanTicker(decodeURIComponent(companyMatch[1]));
    return ticker ? { screen: 'company', ticker } : null;
  }

  const alertMatch = path.match(/^\/alerts?\/(\d+)$/);
  if (alertMatch) {
    return { screen: 'alert', alert: alertMatch[1] };
  }

  return null;
}

export function routeNotificationResponse(response: Notifications.NotificationResponse): boolean {
  const destination = parseNotificationDestination(
    response.notification.request.content.data ?? {},
  );
  if (!destination) return false;

  if (destination.screen === 'company') {
    router.push({
      pathname: '/company/[ticker]',
      params: { ticker: destination.ticker },
    });
  } else if (destination.screen === 'chat') {
    router.push({
      pathname: '/chat',
      params: {
        ...(destination.ticker ? { ticker: destination.ticker } : {}),
        ...(destination.filing ? { filing: destination.filing } : {}),
      },
    });
  } else {
    router.push({ pathname: '/', params: { alert: destination.alert } });
  }
  return true;
}

function cleanTicker(value: string | null): string | undefined {
  const ticker = value?.trim().toUpperCase();
  return ticker && /^[A-Z0-9._-]{1,32}$/.test(ticker) ? ticker : undefined;
}

function readPositiveInteger(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const normalized = String(value);
  return /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
}
