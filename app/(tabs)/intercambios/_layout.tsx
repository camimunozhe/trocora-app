import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function IntercambiosLayout() {
  const { palette } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
