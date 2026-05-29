import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles, type ThemePreference } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';

type Option = { value: ThemePreference; label: string; sub: string; icon: 'phone-portrait' | 'sunny' | 'moon' };

const OPTIONS: Option[] = [
  { value: 'system', label: 'Sistema', sub: 'Sigue la preferencia de tu dispositivo', icon: 'phone-portrait' },
  { value: 'light', label: 'Claro', sub: 'Fondo claro en todo momento', icon: 'sunny' },
  { value: 'dark', label: 'Oscuro', sub: 'Fondo oscuro en todo momento', icon: 'moon' },
];

export default function ThemeScreen() {
  const router = useRouter();
  const { preference, setPreference, palette } = useTheme();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={palette.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tema</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: tabBarClearance }}>
        <View style={styles.list}>
          {OPTIONS.map((opt, i) => {
            const selected = preference === opt.value;
            const last = i === OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.item, last && styles.itemLast]}
                onPress={() => setPreference(opt.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
                  <Ionicons name={opt.icon} size={18} color={selected ? palette.primary : palette.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{opt.label}</Text>
                  <Text style={styles.itemSub}>{opt.sub}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={palette.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
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
  list: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border, overflow: 'hidden',
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14,
    borderBottomWidth: 1, borderBottomColor: p.border,
  },
  itemLast: { borderBottomWidth: 0 },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: p.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBoxSelected: { backgroundColor: p.primaryMuted },
  itemTitle: { color: p.textPrimary, fontSize: 15, fontWeight: '600' },
  itemSub: { color: p.textMuted, fontSize: 12, marginTop: 2 },
}));
