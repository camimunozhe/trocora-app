import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';

export default function RegisterScreen() {
  const { palette } = useTheme();
  const styles = useStyles();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!username || !email || !password) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setStep('verify');
  }

  async function handleVerify() {
    const token = code.trim();
    if (token.length !== 6) {
      Alert.alert('Código inválido', 'Ingresa el código de 6 dígitos que recibiste por email.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'signup',
    });
    setLoading(false);
    if (error) {
      Alert.alert('Código incorrecto', error.message);
      return;
    }
  }

  async function handleResend() {
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Código reenviado', 'Revisa tu correo en unos minutos.');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.title}>{step === 'form' ? 'Crear cuenta' : 'Verifica tu email'}</Text>
          <Text style={styles.subtitle}>
            {step === 'form'
              ? 'Únete a la comunidad TCG'
              : `Te enviamos un código de 6 dígitos a ${email}`}
          </Text>
        </View>

        {step === 'form' ? (
          <View style={styles.form}>
            <Text style={styles.label}>Nombre de usuario</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="trainer123"
              placeholderTextColor={palette.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

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

            <Text style={styles.label}>Contraseña</Text>
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
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? 'Creando cuenta...' : 'Crear cuenta'}</Text>
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>¿Ya tienes cuenta? </Text>
              <Link href="/(auth)/login">
                <Text style={styles.loginLink}>Inicia sesión</Text>
              </Link>
            </View>
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

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? 'Verificando...' : 'Verificar'}</Text>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.loginText}>¿No te llegó? </Text>
              <TouchableOpacity onPress={handleResend} disabled={loading}>
                <Text style={styles.loginLink}>Reenviar código</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => setStep('form')} style={styles.backLinkRow}>
              <Ionicons name="chevron-back" size={14} color={palette.textSecondary} />
              <Text style={styles.backLink}>Volver</Text>
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
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginText: { color: p.textMuted, fontSize: 14 },
  loginLink: { color: p.primary, fontSize: 14, fontWeight: '600' },
}));
