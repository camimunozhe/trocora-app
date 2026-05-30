import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';
import { useInboxCount } from '@/lib/useInboxCount';
import { Icon } from '@/lib/Icon';
import type { SymbolViewProps } from 'expo-symbols';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ focused, sf, ion, label, badge }: { focused: boolean; sf: SymbolViewProps['name']; ion: IoniconName; label: string; badge?: number }) {
  const { palette } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.iconWrap}>
      <View style={styles.iconTop}>
        <View style={[styles.iconPill, focused && styles.iconPillActive]}>
          <Icon sf={sf} ion={ion} size={22} color={focused ? palette.primary : palette.textSecondary} weight={focused ? 'semibold' : 'regular'} />
        </View>
        {badge != null && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : String(badge)}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
    </View>
  );
}

function AvatarTabIcon({ focused, label }: { focused: boolean; label: string }) {
  const { profile } = useAuth();
  const styles = useStyles();
  const initial = profile?.username?.[0]?.toUpperCase() ?? '?';
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.avatarRing, focused && styles.avatarRingActive]}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const pendingCount = useInboxCount(user?.id);

  const tabBarHeight = 58;
  const edgeGap = 24;
  // Mismo margen visual abajo que a los lados; nunca por debajo de la barra de navegación del sistema.
  const tabBarBottom = Math.max(edgeGap, insets.bottom - 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarItemStyle: { paddingTop: 0, paddingBottom: 0, justifyContent: 'center' },
        tabBarIconStyle: { width: '100%', height: '100%', marginTop: 0, marginBottom: 0 },
        sceneStyle: { backgroundColor: palette.bg },
        tabBarStyle: {
          position: 'absolute',
          bottom: tabBarBottom,
          left: 0,
          right: 0,
          marginHorizontal: edgeGap,
          height: tabBarHeight,
          backgroundColor: palette.surface,
          borderRadius: tabBarHeight / 2,
          borderTopWidth: 0,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 16,
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
        },
      }}
    >
      <Tabs.Screen
        name="collection"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} sf={focused ? 'rectangle.stack.fill' : 'rectangle.stack'} ion={focused ? 'albums' : 'albums-outline'} label="Colección" />
          ),
        }}
      />
      <Tabs.Screen
        name="explorar"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} sf={focused ? 'safari.fill' : 'safari'} ion={focused ? 'compass' : 'compass-outline'} label="Explorar" />
          ),
        }}
      />
      <Tabs.Screen
        name="intercambios"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} sf={focused ? 'bubble.left.and.bubble.right.fill' : 'bubble.left.and.bubble.right'} ion={focused ? 'chatbubbles' : 'chatbubbles-outline'} label="Intercambios" badge={pendingCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <AvatarTabIcon focused={focused} label="Perfil" />,
        }}
      />
    </Tabs>
  );
}

const useStyles = makeStyles((p) => ({
  iconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconTop: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPill: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: p.primaryMuted,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: p.textSecondary,
  },
  tabLabelActive: {
    color: p.primary,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: p.danger,
    borderWidth: 2,
    borderColor: p.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  avatarRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: p.border,
  },
  avatarRingActive: {
    borderColor: p.primary,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: p.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
}));
