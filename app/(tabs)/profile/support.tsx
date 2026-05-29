import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { makeStyles } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';

const SUPPORT_EMAIL = 'support@trocora.com';
const TERMS_URL = 'https://trocora.com/terms';
const PRIVACY_URL = 'https://trocora.com/privacy';

export default function SupportScreen() {
  const { user } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();
  const version = Constants.expoConfig?.version ?? '—';

  async function openMail() {
    const subject = encodeURIComponent('Soporte Trocora');
    const body = encodeURIComponent(`\n\n\n———\nApp: Trocora v${version}\nID de usuario: ${user?.id ?? '—'}`);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      dialog.alert({ title: 'Sin app de correo', message: `Escríbenos a ${SUPPORT_EMAIL}` });
      return;
    }
    Linking.openURL(url);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
          <Text style={styles.back}>Configuración</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Soporte</Text>
        <View style={{ width: 100 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarClearance }]}>
        <Text style={styles.sectionLabel}>Contacto</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            ¿Tienes una duda, un problema o quieres reportar algo? Escríbenos y te respondemos lo antes posible.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openMail} activeOpacity={0.85}>
            <Ionicons name="mail-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Contactar a soporte</Text>
          </TouchableOpacity>
          <Text style={styles.muted}>{SUPPORT_EMAIL}</Text>
        </View>

        <Text style={styles.sectionLabel}>Moderación</Text>
        <View style={styles.list}>
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => router.push('/(tabs)/profile/blocked')} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Ionicons name="ban-outline" size={18} color={palette.textSecondary} />
              <Text style={styles.rowText}>Usuarios bloqueados</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Para reportar o bloquear a alguien, abre su perfil o el chat del intercambio y toca el menú (⋯).
        </Text>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.list}>
          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(TERMS_URL)} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={18} color={palette.textSecondary} />
              <Text style={styles.rowText}>Términos de servicio</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={palette.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => Linking.openURL(PRIVACY_URL)} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <Ionicons name="shield-checkmark-outline" size={18} color={palette.textSecondary} />
              <Text style={styles.rowText}>Política de privacidad</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Trocora v{version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 100 },
  back: { color: p.primary, fontSize: 15 },
  title: { color: p.textPrimary, fontSize: 16, fontWeight: '700' },
  scroll: { padding: 20, gap: 8 },

  sectionLabel: {
    color: p.textSecondary, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
  },
  card: {
    backgroundColor: p.surface, borderRadius: 14, borderWidth: 1, borderColor: p.border,
    padding: 14, gap: 12, alignItems: 'center',
  },
  cardText: { color: p.textSecondary, fontSize: 13, lineHeight: 19, alignSelf: 'stretch' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: p.primary, borderRadius: 12, paddingVertical: 13, alignSelf: 'stretch',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  muted: { color: p.textMuted, fontSize: 12 },

  list: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: p.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { color: p.textPrimary, fontSize: 14 },
  hint: { color: p.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },

  version: { color: p.textMuted, fontSize: 11, textAlign: 'center', marginTop: 28 },
}));
