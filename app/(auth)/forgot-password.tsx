import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';
import { useDialog } from '@/lib/AppDialog';

export default function ForgotPasswordScreen() {
  const { palette } = useTheme();
  const styles = useStyles();
  const dialog = useDialog();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    if (!email.trim()) {
      dialog.alert({ title: 'Error', message: 'Ingresa tu email' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) {
      dialog.alert({ title: 'Error', message: error.message });
      return;
    }
    setStep('reset');
  }

  async function handleReset() {
    const token = code.trim();
    if (token.length !== 6) {
      dialog.alert({ title: 'Código inválido', message: 'Ingresa el código de 6 dígitos que recibiste por email.' });
      return;
    }
    if (password.length < 6) {
      dialog.alert({ title: 'Error', message: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'recovery',
    });
    if (otpError) {
      setLoading(false);
      dialog.alert({ title: 'Código incorrecto', message: otpError.message });
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      dialog.alert({ title: 'No se pudo actualizar', message: updateError.message });
      return;
    }
    dialog.alert({ title: 'Contraseña actualizada', message: 'Iniciaste sesión con tu nueva contraseña.' });
    // La sesión ya está activa tras verifyOtp → RootNavigator redirige a la app solo.
  }

  async function handleResend() {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) dialog.alert({ title: 'Error', message: error.message });
    else dialog.alert({ title: 'Código reenviado', message: 'Revisa tu correo en unos minutos.' });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.title}>{step === 'email' ? 'Recuperar contraseña' : 'Nueva contraseña'}</Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'Te enviaremos un código para restablecerla'
              : `Te enviamos un código de 6 dígitos a ${email}`}
          </Text>
        </View>

        {step === 'email' ? (
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@email.com"
              placeholderTextColor={palette.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? 'Enviando...' : 'Enviar código'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.backLinkRow}>
              <Ionicons name="chevron-back" size={14} color={palette.textSecondary} />
              <Text style={styles.backLink}>Volver a iniciar sesión</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Código de verificación</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor={palette.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <Text style={styles.label}>Nueva contraseña</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={palette.textMuted}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? 'Guardando...' : 'Cambiar contraseña'}</Text>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.loginText}>¿No te llegó? </Text>
              <TouchableOpacity onPress={handleResend} disabled={loading}>
                <Text style={styles.loginLink}>Reenviar código</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setStep('email')} style={styles.backLinkRow}>
              <Ionicons name="chevron-back" size={14} color={palette.textSecondary} />
              <Text style={styles.backLink}>Cambiar email</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 80, height: 80, borderRadius: 18, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800', color: p.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: p.textSecondary, marginTop: 6, textAlign: 'center' },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: p.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: p.textPrimary,
  },
  codeInput: {
    fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: '700',
  },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  backLinkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 2, marginTop: 20,
  },
  backLink: { color: p.textSecondary, fontSize: 13 },
  btn: {
    backgroundColor: p.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginText: { color: p.textMuted, fontSize: 14 },
  loginLink: { color: p.primary, fontSize: 14, fontWeight: '600' },
}));
