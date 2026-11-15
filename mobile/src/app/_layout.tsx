/**
 * Root layout — dark theme, safe-area, stack with tabs + alert modal.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setBaseUrl } from '../../lib/api';
import { loadBaseUrl } from '../../lib/store';
import { colors } from '../../lib/theme';
import { routeNotificationResponse } from '../../lib/notifications';

export default function RootLayout() {
  const handledResponses = useRef(new Set<string>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBaseUrl()
      .then((url) => {
        setBaseUrl(url);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Ensure Android nav bar / iOS background stay dark.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SystemUI } = require('expo-system-ui');
      void SystemUI.setBackgroundColorAsync?.(colors.bg);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.current.has(key)) return;
      handledResponses.current.add(key);
      if (routeNotificationResponse(response)) {
        void Notifications.clearLastNotificationResponseAsync();
      }
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) handleResponse(lastResponse);

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
          <Stack.Screen name="company/[ticker]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="alert/[id]"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}
