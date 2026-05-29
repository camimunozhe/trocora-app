import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function OnboardingLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg }, gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="games" />
      <Stack.Screen name="regions" />
    </Stack>
  );
}
