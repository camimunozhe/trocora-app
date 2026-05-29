import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { makeStyles } from '@/lib/theme';
import { REPORT_REASONS, blockUser, reportUser } from '@/lib/moderation';
import type { ReportReason } from '@/types/database';

export function BlockReportSheet({
  visible, onClose, userId, username, meetupId, onBlocked,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  meetupId?: string;
  onBlocked?: () => void;
}) {
  const { user } = useAuth();
  const { palette } = useTheme();
  const dialog = useDialog();
  const styles = useStyles();
  const [mode, setMode] = useState<'menu' | 'report' | 'confirmBlock'>('menu');
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setMode('menu');
    onClose();
  }

  async function submitReport(reason: ReportReason) {
    if (!user || busy) return;
    setBusy(true);
    const { error } = await reportUser({ reporterId: user.id, reportedUserId: userId, reason, meetupId });
    setBusy(false);
    setMode('menu');
    onClose();
    if (error) dialog.alert({ title: 'No se pudo reportar', message: error.message });
    else dialog.alert({ title: 'Reporte enviado', message: 'Gracias. Nuestro equipo revisará este caso.' });
  }

  async function confirmBlock() {
    if (!user || busy) return;
    setBusy(true);
    const { error } = await blockUser(user.id, userId);
    setBusy(false);
    setMode('menu');
    onClose();
    if (error) {
      dialog.alert({ title: 'No se pudo bloquear', message: error.message });
      return;
    }
    dialog.alert({ title: 'Usuario bloqueado', message: `Ya no verás contenido de @${username} ni podrá contactarte.` });
    onBlocked?.();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          {mode === 'menu' && (
            <>
              <Text style={styles.title} numberOfLines={1}>@{username}</Text>
              <TouchableOpacity style={styles.row} onPress={() => setMode('report')} activeOpacity={0.7}>
                <Ionicons name="flag-outline" size={20} color={palette.textPrimary} />
                <Text style={styles.rowText}>Reportar usuario</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.row} onPress={() => setMode('confirmBlock')} activeOpacity={0.7}>
                <Ionicons name="ban-outline" size={20} color={palette.danger} />
                <Text style={[styles.rowText, { color: palette.danger }]}>Bloquear usuario</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={close} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'report' && (
            <>
              <Text style={styles.title} numberOfLines={1}>¿Por qué reportas a @{username}?</Text>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity key={r.value} style={styles.row} onPress={() => submitReport(r.value)} disabled={busy} activeOpacity={0.7}>
                  <Text style={styles.rowText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.cancelBtn} onPress={() => !busy && setMode('menu')} disabled={busy} activeOpacity={0.7}>
                {busy ? <ActivityIndicator color={palette.textSecondary} /> : <Text style={styles.cancelText}>Volver</Text>}
              </TouchableOpacity>
            </>
          )}

          {mode === 'confirmBlock' && (
            <>
              <Text style={styles.title}>Bloquear a @{username}</Text>
              <Text style={styles.body}>
                No verás su contenido en Explorar ni podrá iniciar intercambios contigo. Puedes desbloquearlo desde Configuración → Soporte.
              </Text>
              <TouchableOpacity style={styles.blockBtn} onPress={confirmBlock} disabled={busy} activeOpacity={0.8}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.blockBtnText}>Bloquear</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => !busy && setMode('menu')} disabled={busy} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const useStyles = makeStyles((p) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: p.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36,
    gap: 4,
  },
  title: { color: p.textPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { color: p.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: p.bg,
    marginBottom: 8,
  },
  rowText: { color: p.textPrimary, fontSize: 15, fontWeight: '600' },
  blockBtn: {
    backgroundColor: p.danger, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginBottom: 8,
  },
  blockBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelText: { color: p.textSecondary, fontSize: 15, fontWeight: '600' },
}));
