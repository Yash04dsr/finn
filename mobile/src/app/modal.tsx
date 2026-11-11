/**
 * modal — placeholder route (alerts use an in-feed sheet overlay instead).
 */
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { colors, type } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ModalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 20 }]}>
      <Text style={type.title}>Nothing here</Text>
      <Text style={[type.small, { marginTop: 6 }]}>
        Alert details open as a sheet inside the Feed tab.
      </Text>
      <Pressable onPress={() => router.back()} style={styles.close}>
        <Text style={{ color: colors.accent, fontWeight: '600' }}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  close: { marginTop: 18, paddingVertical: 8, paddingHorizontal: 18 },
});
