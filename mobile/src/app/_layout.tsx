/**
 * Root layout — dark theme, safe-area, stack with tabs + alert modal.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';

export default function RootLayout() {
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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
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
            name="modal"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}
