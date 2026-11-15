/**
 * Tabs layout — same bar as the web app: white ground, black top rule,
 * uppercase tracked labels, a black tick on the active tab.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { ChatIcon, CompaniesIcon, FeedIcon, SettingsIcon } from '../../../components/ui';

const TABS = [
  { name: 'index', label: 'BRIEF', Icon: FeedIcon },
  { name: 'chat', label: 'ASK', Icon: ChatIcon },
  { name: 'companies', label: 'COMPANIES', Icon: CompaniesIcon },
  { name: 'settings', label: 'SETTINGS', Icon: SettingsIcon },
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
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: '#000000',
              paddingBottom: Math.max(insets.bottom, 6),
              paddingTop: 6,
            }}
          >
            {TABS.map((t) => {
              const route = state.routes.find((r) => r.name === t.name);
              const focused = activeName === t.name;
              const color = focused ? '#000000' : '#808080';
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
                    {focused ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: -8,
                          width: 24,
                          height: 3,
                          backgroundColor: '#000000',
                        }}
                      />
                    ) : null}
                    <t.Icon size={22} focused={focused} color={color} />
                  </View>
                  <Text
                    style={{
                      fontSize: 9,
                      marginTop: 3,
                      fontWeight: '600',
                      color: focused ? '#000000' : '#6B7280',
                      letterSpacing: 1.1,
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
      <Tabs.Screen name="index" options={{ title: 'Brief' }} />
      <Tabs.Screen name="chat" options={{ title: 'Ask' }} />
      <Tabs.Screen name="companies" options={{ title: 'Companies' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
