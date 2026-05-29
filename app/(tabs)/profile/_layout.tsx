import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function ProfileLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="games" />
      <Stack.Screen name="currency" />
      <Stack.Screen name="theme" />
      <Stack.Screen name="regions" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="support" />
      <Stack.Screen name="blocked" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="watchlist" />
      <Stack.Screen name="watchlist-add" />
    </Stack>
  );
}
