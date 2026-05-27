import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Pressable, ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

type AlertOptions = {
  title: string;
  message?: string;
  confirmText?: string;
};

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOptions; busy: boolean }
  | { kind: 'alert'; opts: AlertOptions }
  | null;

type DialogContextValue = {
  confirm: (opts: ConfirmOptions) => void;
  alert: (opts: AlertOptions) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState({ kind: 'confirm', opts, busy: false });
  }, []);

  const alert = useCallback((opts: AlertOptions) => {
    setState({ kind: 'alert', opts });
  }, []);

  const close = useCallback(() => setState(null), []);

  async function handleConfirm() {
    if (state?.kind !== 'confirm') return;
    setState({ ...state, busy: true });
    try {
      await state.opts.onConfirm();
    } finally {
      setState(null);
    }
  }

  function handleCancel() {
    if (state?.kind === 'confirm') state.opts.onCancel?.();
    close();
  }

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      <DialogModal
        state={state}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
        onClose={close}
      />
    </DialogContext.Provider>
  );
}

function DialogModal({
  state,
  onCancel,
  onConfirm,
  onClose,
}: {
  state: DialogState;
  onCancel: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const visible = state !== null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={state?.kind === 'alert' ? onClose : onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          {state && (
            <>
              <Text style={styles.title}>{state.opts.title}</Text>
              {state.opts.message ? <Text style={styles.message}>{state.opts.message}</Text> : null}
              <View style={styles.actions}>
                {state.kind === 'confirm' ? (
                  <>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnGhost]}
                      onPress={onCancel}
                      disabled={state.busy}
                    >
                      <Text style={styles.btnGhostText}>{state.opts.cancelText ?? 'Cancelar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, state.opts.destructive ? styles.btnDestructive : styles.btnPrimary]}
                      onPress={onConfirm}
                      disabled={state.busy}
                    >
                      {state.busy
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.btnPrimaryText}>{state.opts.confirmText ?? 'Confirmar'}</Text>
                      }
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnFull]} onPress={onClose}>
                    <Text style={styles.btnPrimaryText}>{state.opts.confirmText ?? 'OK'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

const useStyles = makeStyles((p) => ({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 360,
    backgroundColor: p.surface,
    borderRadius: 16, borderWidth: 1, borderColor: p.border,
    padding: 20,
  },
  title: { color: p.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  message: { color: p.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  btnFull: { flex: 1 },
  btnGhost: { backgroundColor: p.bg, borderWidth: 1, borderColor: p.border },
  btnGhostText: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  btnPrimary: { backgroundColor: p.primary },
  btnDestructive: { backgroundColor: p.danger },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}));
