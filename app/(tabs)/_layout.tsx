import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';
import { usePendingMeetupsCount } from '@/lib/usePendingMeetupsCount';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ focused, icon, badge }: { focused: boolean; icon: IoniconName; badge?: number }) {
  const { palette } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.iconPill, focused && styles.iconPillActive]}>
        <Ionicons name={icon} size={26} color={focused ? palette.primary : palette.textSecondary} />
      </View>
      {badge != null && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : String(badge)}</Text>
        </View>
      )}
    </View>
  );
}

function AvatarTabIcon({ focused }: { focused: boolean }) {
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
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const pendingCount = usePendingMeetupsCount(user?.id);

  const tabBarHeight = 56;
  const tabBarBottom = insets.bottom > 0 ? insets.bottom : 12;
  const sceneBottomPad = tabBarHeight + tabBarBottom + 12;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarItemStyle: { paddingTop: 0, paddingBottom: 0, justifyContent: 'center' },
        tabBarIconStyle: { width: '100%', height: '100%', marginTop: 0, marginBottom: 0 },
        sceneStyle: { backgroundColor: palette.bg, paddingBottom: sceneBottomPad },
        tabBarStyle: {
          position: 'absolute',
          bottom: tabBarBottom,
          left: 0,
          right: 0,
          marginHorizontal: 32,
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
            <TabIcon focused={focused} icon={focused ? 'albums' : 'albums-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="meetups"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={focused ? 'search' : 'search-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="encuentros"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={focused ? 'swap-horizontal' : 'swap-horizontal-outline'} badge={pendingCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <AvatarTabIcon focused={focused} />,
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
  },
  iconPill: {
    width: 56,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: p.primaryMuted,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: '50%',
    transform: [{ translateX: 22 }],
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
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarRingActive: {
    borderColor: p.primary,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: p.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
}));
