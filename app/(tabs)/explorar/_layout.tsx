import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function ExplorarLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
