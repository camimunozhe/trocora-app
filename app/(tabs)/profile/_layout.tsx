import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="games" />
      <Stack.Screen name="currency" />
      <Stack.Screen name="theme" />
      <Stack.Screen name="regions" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="watchlist" />
      <Stack.Screen name="watchlist-add" />
    </Stack>
  );
}
