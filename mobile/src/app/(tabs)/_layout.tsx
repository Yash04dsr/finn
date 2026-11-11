/**
 * Tabs layout — custom dark bottom tab bar (Feed, Chat, Companies, Settings).
 * Uses expo-router's vendored bottom-tabs tabBar render prop
 * ({ state, navigateToTab, insets }).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '../../../lib/theme';
import { ChatIcon, CompaniesIcon, FeedIcon, SettingsIcon } from '../../../components/ui';

const TABS = [
  { name: 'index', label: 'Feed', Icon: FeedIcon },
  { name: 'chat', label: 'Chat', Icon: ChatIcon },
  { name: 'companies', label: 'Companies', Icon: CompaniesIcon },
  { name: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigateToTab, insets }) => {
        const activeName = state.routes[state.index]?.name;
        return (
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: 'rgba(13,18,27,0.97)',
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
              paddingTop: 8,
            }}
          >
            {TABS.map((t) => {
              const route = state.routes.find((r) => r.name === t.name);
              const focused = activeName === t.name;
              const color = focused ? colors.accent : colors.muted;
              return (
                <Pressable
                  key={t.name}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  onPress={() => {
                    if (route && !focused) navigateToTab(route.key);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    paddingTop: 4,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ height: 26, alignItems: 'center', justifyContent: 'center' }}>
                    <t.Icon size={22} focused={focused} color={color} />
                  </View>
                  <Text
                    style={{
                      fontSize: 10.5,
                      marginTop: 3,
                      fontWeight: focused ? '700' : '500',
                      color,
                      letterSpacing: 0.2,
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="companies" options={{ title: 'Companies' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
