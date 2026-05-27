import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { makeStyles } from '@/lib/theme';

export default function PrivacyScreen() {
  const { signOut } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const styles = useStyles();

  function handleDeleteAccount() {
    dialog.confirm({
      title: 'Eliminar cuenta',
      message:
        'Vas a borrar tu cuenta y todos tus datos: colección, carpetas, intercambios, mensajes y foto de perfil. Esta acción es permanente y no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      destructive: true,
      onConfirm: async () => {
        const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
        if (error) {
          dialog.alert({
            title: 'No se pudo eliminar',
            message: error.message ?? 'Intenta de nuevo en unos minutos.',
          });
          return;
        }
        await signOut();
      },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
          <Text style={styles.back}>Perfil</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacidad</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Tus datos</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Tus datos se guardan en servidores seguros y solo se usan para hacer funcionar la app: tu colección, tus intercambios, los mensajes con otros usuarios y tus notificaciones.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Eliminar cuenta</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Si eliminas tu cuenta se borrarán de forma permanente tu perfil, colección, carpetas, intercambios, mensajes y foto. No se puede recuperar.
          </Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={palette.danger} />
            <Text style={styles.deleteText}>Eliminar mi cuenta</Text>
          </TouchableOpacity>
        </View>
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
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  back: { color: p.primary, fontSize: 15 },
  title: { color: p.textPrimary, fontSize: 16, fontWeight: '700' },
  scroll: { padding: 20, gap: 8 },

  sectionLabel: {
    color: p.textSecondary, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
  },
  card: {
    backgroundColor: p.surface, borderRadius: 14, borderWidth: 1, borderColor: p.border,
    padding: 14, gap: 12,
  },
  cardText: { color: p.textSecondary, fontSize: 13, lineHeight: 19 },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: p.danger + '55', backgroundColor: p.danger + '11',
  },
  deleteText: { color: p.danger, fontSize: 14, fontWeight: '600' },
}));
