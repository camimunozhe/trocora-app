import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DialogProvider } from '@/lib/AppDialog';
import { usePushTokenRegistration } from '@/lib/usePushTokenRegistration';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

function RootNavigator() {
  const { session, loading, user, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [pendingMeetupId, setPendingMeetupId] = useState<string | null>(null);
  const handledColdStart = useRef(false);
  const purchasesConfigured = useRef(false);

  usePushTokenRegistration(user?.id);

  useEffect(() => {
    if (purchasesConfigured.current) return;
    // RC no funciona en Expo Go: no hay StoreKit nativo. Solo se inicializa
    // en builds nativos (dev build, TestFlight, App Store).
    if (Constants.appOwnership === 'expo') return;
    try {
      const keys = (Constants.expoConfig?.extra as any)?.revenuecat ?? {};
      const apiKey = Platform.OS === 'ios' ? keys.ios : keys.android;
      if (!apiKey) return;
      if (!Purchases || typeof Purchases.configure !== 'function') return;
      Purchases.configure({ apiKey });
      purchasesConfigured.current = true;
    } catch (e) {
      console.warn('[purchases] configure failed', e);
    }
  }, []);

  useEffect(() => {
    if (!purchasesConfigured.current || !user) return;
    try {
      Purchases.logIn(user.id).catch(() => {});
    } catch (e) {
      console.warn('[purchases] logIn failed', e);
    }
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }
    if (!profile) return; // esperar a que cargue el perfil antes de decidir ruta

    if (!profile.onboarding_completed && !inOnboarding) {
      router.replace('/(onboarding)/welcome');
    } else if (profile.onboarding_completed && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)/collection');
    }
  }, [session, loading, segments, profile?.onboarding_completed]);

  useEffect(() => {
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync().then(resp => {
        const id = (resp?.notification.request.content.data as any)?.meetup_id;
        if (typeof id === 'string') setPendingMeetupId(id);
      });
    }
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const id = (resp.notification.request.content.data as any)?.meetup_id;
      if (typeof id === 'string') setPendingMeetupId(id);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingMeetupId || loading || !session) return;
    router.push({ pathname: '/intercambio/[id]', params: { id: pendingMeetupId } });
    setPendingMeetupId(null);
  }, [pendingMeetupId, loading, session]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0F172A' } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="user/[id]" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <Stack.Screen name="intercambio/[id]" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <Stack.Screen name="intercambio/nueva" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <AuthProvider>
          <DialogProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </DialogProvider>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}
