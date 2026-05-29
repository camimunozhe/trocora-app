import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';

export function UndoSnackbar({ visible, message, onUndo, bottomOffset = 100 }: {
  visible: boolean;
  message: string;
  onUndo: () => void;
  bottomOffset?: number;
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  if (!visible) return null;
  return (
    <View style={[styles.snackbar, { bottom: bottomOffset }]}>
      <Ionicons name="trash-outline" size={18} color={palette.textSecondary} />
      <Text style={styles.snackbarText}>{message}</Text>
      <TouchableOpacity onPress={onUndo} style={styles.snackbarBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.snackbarBtnText}>Deshacer</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((p) => ({
  snackbar: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  snackbarText: { flex: 1, color: p.textPrimary, fontSize: 14, fontWeight: '500' },
  snackbarBtn: { paddingHorizontal: 4 },
  snackbarBtnText: { color: p.primary, fontSize: 14, fontWeight: '700' },
}));
