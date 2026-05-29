import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { supabase } from '@/lib/supabase';
import { usePremium } from '@/lib/usePremium';
import { makeStyles } from '@/lib/theme';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Feature = { icon: IoniconName; title: string; desc: string; color: string };

const FEATURES: Feature[] = [
  { icon: 'notifications', title: 'Alertas de cartas', desc: 'Te avisamos cuando alguien publica una carta de tu watchlist en tu región.', color: '#FACC15' },
  { icon: 'rocket', title: 'Boost en Explorar', desc: 'Tus publicaciones aparecen primero, llegan a más compradores.', color: '#D4A864' },
  { icon: 'options', title: 'Filtros avanzados', desc: 'Busca por precio, condición, foil, set y mucho más.', color: '#A78BFA' },
  { icon: 'camera', title: 'Fotos propias', desc: 'Sube fotos reales de tus cartas en cada publicación.', color: '#4ADE80' },
  { icon: 'stats-chart', title: 'Stats de colección', desc: 'Valor histórico, completitud de sets y top cartas.', color: '#FB923C' },
  { icon: 'shield-checkmark', title: 'Badge Trocora Pro', desc: 'Muéstrale a la comunidad que eres coleccionista serio.', color: '#22C55E' },
  { icon: 'infinite', title: 'Sin límites', desc: 'Carpetas, regiones, publicaciones y trades ilimitados.', color: '#F472B6' },
];

function annualMonthlyPriceLabel(annual: PurchasesPackage): string | null {
  const monthly = annual.product.price / 12;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: annual.product.currencyCode,
      maximumFractionDigits: 2,
    }).format(monthly);
  } catch {
    return null;
  }
}

function introPeriodLabel(intro: { periodNumberOfUnits: number; periodUnit?: string } | null | undefined): string {
  if (!intro) return '';
  const n = intro.periodNumberOfUnits;
  const unit = (intro.periodUnit ?? 'DAY').toUpperCase();
  const map: Record<string, [string, string]> = {
    DAY: ['día', 'días'],
    WEEK: ['semana', 'semanas'],
    MONTH: ['mes', 'meses'],
    YEAR: ['año', 'años'],
  };
  const [singular, plural] = map[unit] ?? map.DAY;
  return `${n} ${n === 1 ? singular : plural}`;
}

export default function PaywallScreen() {
  const router = useRouter();
  const { refreshProfile, user } = useAuth();
  const { palette } = useTheme();
  const { isPremium, until } = usePremium();
  const dialog = useDialog();
  const styles = useStyles();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (IS_EXPO_GO) {
      setLoadingOfferings(false);
      return;
    }
    Purchases.getOfferings()
      .then(res => {
        if (!mounted) return;
        const current = res.current ?? null;
        setOffering(current);
        const def = current?.annual ?? current?.monthly ?? current?.availablePackages?.[0] ?? null;
        setSelectedPackage(def);
      })
      .catch(err => console.warn('[paywall] getOfferings failed', err))
      .finally(() => { if (mounted) setLoadingOfferings(false); });
    return () => { mounted = false; };
  }, []);

  const annual = offering?.annual ?? null;
  const monthly = offering?.monthly ?? null;

  async function waitForPremiumActivation() {
    if (!user) return;
    const maxAttempts = 8;
    const delayMs = 1500;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, delayMs));
      const { data } = await supabase
        .from('profiles')
        .select('premium_status')
        .eq('id', user.id)
        .maybeSingle();
      const status = (data as any)?.premium_status;
      if (status === 'active' || status === 'in_grace') {
        await refreshProfile().catch(() => {});
        return;
      }
    }
    await refreshProfile().catch(() => {});
  }

  async function handleSubscribe() {
    if (!selectedPackage) return;
    setPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
      const isPro = !!customerInfo.entitlements.active['pro'];
      waitForPremiumActivation();
      if (isPro) {
        dialog.alert({ title: '¡Bienvenido a Trocora Pro!', message: 'Tu suscripción está activa.' });
      }
      router.back();
    } catch (e: any) {
      if (!e.userCancelled) {
        dialog.alert({ title: 'No se pudo procesar', message: e.message ?? 'Intenta de nuevo en un momento.' });
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      const isPro = !!info.entitlements.active['pro'];
      waitForPremiumActivation();
      dialog.alert({
        title: isPro ? 'Compras restauradas' : 'Sin compras activas',
        message: isPro ? 'Tu Trocora Pro quedó activo.' : 'No encontramos suscripciones activas en esta cuenta.',
      });
      if (isPro) router.back();
    } catch (e: any) {
      dialog.alert({ title: 'Error', message: e.message ?? 'No se pudo restaurar.' });
    } finally {
      setRestoring(false);
    }
  }

  const annualMonthly = annual ? annualMonthlyPriceLabel(annual) : null;

  const untilLabel = until
    ? until.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  function openManageSubscription() {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color={palette.textSecondary} />
        </TouchableOpacity>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollPad}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="star" size={14} color={palette.warning} />
            <Text style={styles.heroBadgeText}>TROCORA PRO</Text>
          </View>
          <Text style={styles.title}>
            {isPremium ? 'Ya eres parte de Trocora Pro' : 'Saca el máximo a tu colección'}
          </Text>
          <Text style={styles.subtitle}>
            {isPremium
              ? 'Disfruta todos los beneficios premium incluidos en tu plan.'
              : 'Funciones premium para coleccionistas y vendedores activos.'}
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: `${f.color}1A` }]}>
                <Ionicons name={f.icon} size={20} color={f.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {isPremium ? (
          <View style={styles.activeCard}>
            <View style={styles.activeIconWrap}>
              <Ionicons name="checkmark-circle" size={28} color={palette.successAlt} />
            </View>
            <Text style={styles.activeTitle}>Suscripción activa</Text>
            {untilLabel && (
              <Text style={styles.activeDate}>Tu plan se renueva el {untilLabel}</Text>
            )}
            <TouchableOpacity style={styles.manageBtn} onPress={openManageSubscription} activeOpacity={0.85}>
              <Ionicons name="settings-outline" size={16} color={palette.textPrimary} />
              <Text style={styles.manageBtnText}>Gestionar suscripción</Text>
            </TouchableOpacity>
            <Text style={styles.activeHint}>
              Para cancelar o cambiar de plan, abre los ajustes de tu tienda.
            </Text>
          </View>
        ) : (
        <>
        <View style={styles.plans}>
          {loadingOfferings ? (
            <ActivityIndicator color={palette.textSecondary} style={{ paddingVertical: 24 }} />
          ) : !offering ? (
            <View style={styles.unavailableBox}>
              <Ionicons name="alert-circle-outline" size={20} color={palette.textSecondary} />
              <Text style={styles.unavailableText}>
                No pudimos cargar los planes ahora mismo. Verifica tu conexión e intenta de nuevo.
              </Text>
            </View>
          ) : (
            <>
              {annual && (
                <TouchableOpacity
                  style={[styles.planBox, selectedPackage?.identifier === annual.identifier && styles.planBoxActive]}
                  onPress={() => setSelectedPackage(annual)}
                  activeOpacity={0.8}
                >
                  <View style={styles.planHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planLabel}>Anual</Text>
                      <Text style={styles.planPrice}>{annual.product.priceString} / año</Text>
                      {annualMonthly && (
                        <Text style={styles.planPriceSub}>Equivale a {annualMonthly} / mes</Text>
                      )}
                    </View>
                    {monthly && annual.product.price < monthly.product.price * 12 && (
                      <View style={styles.savingBadge}>
                        <Text style={styles.savingBadgeText}>
                          AHORRA {Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100)}%
                        </Text>
                      </View>
                    )}
                  </View>
                  {annual.product.introPrice && (
                    <Text style={styles.planTrial}>
                      {introPeriodLabel(annual.product.introPrice)} gratis · Cancela cuando quieras
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {monthly && (
                <TouchableOpacity
                  style={[styles.planBox, selectedPackage?.identifier === monthly.identifier && styles.planBoxActive]}
                  onPress={() => setSelectedPackage(monthly)}
                  activeOpacity={0.8}
                >
                  <View style={styles.planHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planLabel}>Mensual</Text>
                      <Text style={styles.planPrice}>{monthly.product.priceString} / mes</Text>
                    </View>
                  </View>
                  <Text style={styles.planTrial}>Cancela cuando quieras</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.cta, (!selectedPackage || purchasing) && styles.ctaDisabled]}
          onPress={handleSubscribe}
          disabled={!selectedPackage || purchasing}
          activeOpacity={0.85}
        >
          {purchasing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.ctaText}>
                {selectedPackage?.product.introPrice
                  ? `Empezar ${introPeriodLabel(selectedPackage.product.introPrice)} gratis`
                  : 'Suscribirme'}
              </Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>{restoring ? 'Restaurando…' : 'Restaurar compras'}</Text>
        </TouchableOpacity>

        <Text style={styles.legalText}>
          Se renueva automáticamente. Puedes cancelar en cualquier momento desde la configuración de tu tienda (App Store / Google Play). La suscripción se cobra a tu cuenta de la tienda al confirmar la compra.
        </Text>

        <View style={styles.legalLinksRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://trocora.com/privacy')}>
            <Text style={styles.legalLink}>Política de Privacidad</Text>
          </TouchableOpacity>
          <Text style={styles.legalLinkSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://trocora.com/terms')}>
            <Text style={styles.legalLink}>Términos de Uso</Text>
          </TouchableOpacity>
        </View>
        </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  scrollPad: { paddingHorizontal: 20, paddingBottom: 20 },

  hero: { alignItems: 'center', paddingVertical: 16 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: p.warning,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 14,
  },
  heroBadgeText: { color: p.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: p.textPrimary, fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 32, paddingHorizontal: 16 },
  subtitle: { color: p.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },

  features: { gap: 12, marginTop: 20 },
  feature: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: p.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: p.border,
  },
  featureIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { color: p.textPrimary, fontSize: 14, fontWeight: '700' },
  featureDesc: { color: p.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },

  plans: { marginTop: 24, gap: 10 },
  planBox: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 2, borderColor: p.border,
    padding: 16,
  },
  planBoxActive: { borderColor: p.primary, backgroundColor: p.primaryMuted },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  planLabel: { color: p.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planPrice: { color: p.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 4 },
  planPriceSub: { color: p.textMuted, fontSize: 12, marginTop: 2 },
  planTrial: { color: p.successAlt, fontSize: 12, fontWeight: '600', marginTop: 8 },
  savingBadge: {
    backgroundColor: p.successAlt, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  savingBadgeText: { color: p.bg, fontSize: 10, fontWeight: '800' },

  unavailableBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    padding: 14,
  },
  unavailableText: { color: p.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 },

  cta: {
    marginTop: 20, backgroundColor: p.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  restoreBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  restoreText: { color: p.primary, fontSize: 13, fontWeight: '600' },

  legalText: { color: p.textMuted, fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },
  legalLinksRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 },
  legalLink: { color: p.primary, fontSize: 12, fontWeight: '600' },
  legalLinkSep: { color: p.textMuted, fontSize: 12 },

  activeCard: {
    marginTop: 24,
    backgroundColor: p.surface, borderRadius: 14,
    borderWidth: 1, borderColor: p.successAlt + '55',
    padding: 20, alignItems: 'center',
  },
  activeIconWrap: { marginBottom: 8 },
  activeTitle: { color: p.textPrimary, fontSize: 17, fontWeight: '700' },
  activeDate: { color: p.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'center' },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 18,
    backgroundColor: p.surfaceAlt, borderRadius: 10,
    alignSelf: 'stretch',
  },
  manageBtnText: { color: p.textPrimary, fontSize: 14, fontWeight: '600' },
  activeHint: { color: p.textMuted, fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 16 },
}));
