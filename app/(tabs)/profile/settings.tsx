import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { usePremium } from '@/lib/usePremium';
import { GAME_DISPLAY_NAMES, resolveEnabledGames } from '@/lib/enabledGames';
import { makeStyles } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';

const THEME_LABEL: Record<'light' | 'dark' | 'system', string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Oscuro',
};

export default function SettingsScreen() {
  const router = useRouter();
  const dialog = useDialog();
  const { user, profile, signOut } = useAuth();
  const { palette, preference } = useTheme();
  const premium = usePremium();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();

  function handleSignOut() {
    dialog.confirm({
      title: 'Cerrar sesión',
      message: '¿Seguro que quieres salir?',
      confirmText: 'Salir',
      cancelText: 'Cancelar',
      destructive: true,
      onConfirm: () => signOut(),
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={palette.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tabBarClearance }}>
        <TouchableOpacity
          style={styles.proCard}
          activeOpacity={0.85}
          onPress={() => router.push('/paywall')}
        >
          <View style={styles.proIconBox}>
            <Ionicons name="star" size={18} color={palette.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.proTitle}>
              {premium.status === 'active' ? 'Trocora Pro activo'
                : premium.status === 'in_grace' ? 'Problema con tu Pro'
                : premium.status === 'expired' ? 'Tu Pro venció'
                : 'Probar Trocora Pro'}
            </Text>
            <Text style={styles.proSub} numberOfLines={2}>
              {premium.isPremium
                ? premium.until
                  ? `Renueva el ${premium.until.toLocaleDateString('es')}`
                  : 'Acceso ilimitado a todas las funciones'
                : '7 días gratis · Alertas, boost, filtros avanzados y más'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trocora Pro</Text>
          <View style={styles.list}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/watchlist')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="heart-outline" size={18} color={palette.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Watchlist y alertas</Text>
                  <Text style={styles.menuItemSub}>Cartas que quieres conseguir</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/catalog')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="layers-outline" size={18} color={palette.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Catálogo de sets</Text>
                  <Text style={styles.menuItemSub}>Explora sets y precios sin agregar</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.list}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/profile/games')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="game-controller-outline" size={18} color={palette.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Juegos</Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {resolveEnabledGames(profile?.enabled_games).filter(g => g !== 'other').map(g => GAME_DISPLAY_NAMES[g].split(':')[0]).join(' · ')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/profile/currency')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="cash-outline" size={18} color={palette.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Divisa</Text>
                  <Text style={styles.menuItemSub}>Para mostrar precios en tu colección</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.value}>{(profile?.currency ?? 'usd').toUpperCase()}</Text>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/profile/theme')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="contrast-outline" size={18} color={palette.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Tema</Text>
                  <Text style={styles.menuItemSub}>Claro, oscuro o según tu dispositivo</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.value}>{THEME_LABEL[preference]}</Text>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/(tabs)/profile/regions')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="location-outline" size={18} color={palette.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Regiones</Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>
                    {(profile?.regions ?? []).length > 0
                      ? `${(profile?.regions ?? []).length} seleccionada${(profile?.regions ?? []).length === 1 ? '' : 's'}`
                      : 'Donde puedes intercambiar'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.list}>
            <View style={styles.menuItem}>
              <View style={styles.menuItemContent}>
                <Ionicons name="mail-outline" size={18} color={palette.textSecondary} />
                <Text style={styles.menuItemText}>{user?.email}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/profile/support')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="help-circle-outline" size={18} color={palette.textSecondary} />
                <Text style={styles.menuItemText}>Soporte</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/(tabs)/profile/privacy')}>
              <View style={styles.menuItemContent}>
                <Ionicons name="lock-closed-outline" size={18} color={palette.textSecondary} />
                <Text style={styles.menuItemText}>Privacidad</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color={palette.danger} />
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>v{Constants.expoConfig?.version ?? '—'}</Text>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  headerTitle: { color: p.textPrimary, fontSize: 17, fontWeight: '700' },

  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: p.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  list: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: p.border,
  },
  menuItemContent: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { color: p.textPrimary, fontSize: 14 },
  menuItemSub: { color: p.textMuted, fontSize: 12, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    padding: 14,
  },
  signOutText: { color: p.danger, fontSize: 14, fontWeight: '600' },

  version: { color: p.textMuted, fontSize: 11, textAlign: 'center', marginTop: 24 },

  proCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.warning,
    padding: 14,
  },
  proIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(250,204,21,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  proTitle: { color: p.textPrimary, fontSize: 15, fontWeight: '700' },
  proSub: { color: p.textSecondary, fontSize: 12, marginTop: 2 },
}));
