import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, TurboModuleRegistry } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ConvexProvider } from 'convex/react';
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken, setToken, removeToken, PLAYER_TOKEN_KEY } from './src/secureTokens';
import { RootStackParamList, MainTabParamList, CompanyTabParamList } from './src/types';
import { theme } from './src/theme';
import { convex } from './src/convex';
import { api } from './convex/_generated/api';
import {
  CompanySessionProvider,
  saveCompanySession,
  loadCompanySession,
  clearCompanySession,
} from './src/companySession';
import { UserProvider } from './src/UserContext';
import { LanguageProvider, useTranslation } from './src/i18n';
import { addNotificationResponseListener } from './src/notifications';
import { syncPlayerPush, syncCompanyPush, unregisterPush } from './src/pushRegistration';
import { BOOKING_ENABLED } from './src/features';
import { useNotificationWatcher } from './src/useNotificationWatcher';
import { ErrorBoundary } from './src/ErrorBoundary';
import { initCrashReporting, setUser as setCrashUser } from './src/crashReporting';
import { initializePayments } from './src/payments';

// Initialize crash reporting and payments as early as possible
initCrashReporting();
initializePayments();

// Player Screens
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import Onboarding from './src/screens/Onboarding';
import HomeScreen from './src/screens/HomeScreen';
import DiscoverScreen from './src/screens/DiscoverScreen';
import TicketsScreen from './src/screens/TicketsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RoomDetails from './src/screens/RoomDetails';
import PlayerProfileScreen from './src/screens/PlayerProfileScreen';
import CompaniesScreen from './src/screens/CompaniesScreen';
import CompanyProfileScreen from './src/screens/CompanyProfileScreen';
import PassportScreen from './src/screens/PassportScreen';
import ScanStampScreen from './src/screens/ScanStampScreen';
import AddPlayScreen from './src/screens/plays/AddPlayScreen';
import PlayedRoomScreen from './src/screens/plays/PlayedRoomScreen';
import TowerScreen from './src/screens/TowerScreen';
import JobsScreen from './src/screens/JobsScreen';
import CompanyJobs from './src/screens/company/CompanyJobs';
import CompanyPassport from './src/screens/company/CompanyPassport';
import DateTimeSelect from './src/screens/DateTimeSelect';
import Checkout from './src/screens/Checkout';
import BookingConfirmation from './src/screens/BookingConfirmation';
import MapViewScreen from './src/screens/MapView';
import SocialScreen from './src/screens/SocialScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import MessagesScreen from './src/screens/chat/MessagesScreen';
import ChatScreen from './src/screens/chat/ChatScreen';
import { useBackgroundKeySharing } from './src/chat/useChat';

// Legal & Settings Screens (Apple Guidelines compliance)
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/TermsOfServiceScreen';
import NotificationPrefsScreen from './src/screens/NotificationPrefsScreen';
import ShopScreen from './src/screens/shop/ShopScreen';
import CompanyMerch from './src/screens/company/CompanyMerch';
import CompanyMerchEditor from './src/screens/company/CompanyMerchEditor';
import ProductScreen from './src/screens/shop/ProductScreen';
import CartScreen from './src/screens/shop/CartScreen';
import MerchCheckoutScreen from './src/screens/shop/MerchCheckoutScreen';
import { MerchOrdersScreen, MerchOrderScreen } from './src/screens/shop/MerchOrdersScreen';

// Company Screens
import CompanyAuth from './src/screens/company/CompanyAuth';
import CompanyDashboard from './src/screens/company/CompanyDashboard';
import CompanyRoomsList from './src/screens/company/CompanyRoomsList';
import CompanyRoomEditor from './src/screens/company/CompanyRoomEditor';
import CompanyAvailability from './src/screens/company/CompanyAvailability';
import CompanyBookings from './src/screens/company/CompanyBookings';
import CompanySettings from './src/screens/company/CompanySettings';
import CompanyBookingDetail from './src/screens/company/CompanyBookingDetail';
import CompanyAddBooking from './src/screens/company/CompanyAddBooking';
import CompanyOnboarding from './src/screens/company/CompanyOnboarding';
import CompanyPhotos from './src/screens/company/CompanyPhotos';
import CompanyBilling from './src/screens/company/CompanyBilling';
import CompanyPayments from './src/screens/company/CompanyPayments';
import CompanyGuide from './src/screens/company/CompanyGuide';
import PlayerSettings from './src/screens/PlayerSettings';
import CompanyNotificationPrefs from './src/screens/company/CompanyNotificationPrefs';
import CompanySlots from './src/screens/company/CompanySlots';

const Stack = createNativeStackNavigator<RootStackParamList>();
/**
 * iOS uses the system tab bar (UITabBarController), so on iOS 26 it is Apple's
 * Liquid Glass bar and on older versions the standard translucent one.
 * Android keeps the JS tab bar.
 *
 * An over-the-air update can land on a build made before the native tab bar
 * was added (same app version, older binary). Those builds have no native tab
 * view, so we only use it when its native code is really in the binary and
 * fall back to the JS tab bar otherwise.
 */
const NATIVE_TABS = Platform.OS === 'ios' && TurboModuleRegistry.get('SvgDecoder') != null;
const createNativeTabs: () => any = NATIVE_TABS
  ? require('@bottom-tabs/react-navigation').createNativeBottomTabNavigator
  : createBottomTabNavigator;
const Tab: any = NATIVE_TABS ? createNativeTabs() : createBottomTabNavigator<MainTabParamList>();
const CompanyTab: any = NATIVE_TABS ? createNativeTabs() : createBottomTabNavigator<CompanyTabParamList>();

/** Navigator props: the glass bar takes its look from the system, only the tint is ours. */
const tabNavigatorProps: any = NATIVE_TABS
  ? {
      translucent: true,
      hapticFeedbackEnabled: true,
      tabBarActiveTintColor: theme.colors.redLight,
      tabBarInactiveTintColor: theme.colors.textMuted,
    }
  : {};

const tabScreenOptions: any = NATIVE_TABS
  ? {
      tabBarActiveTintColor: theme.colors.redLight,
      sceneStyle: { backgroundColor: theme.colors.bgPrimary },
    }
  : {
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.colors.bgBar,
        borderTopColor: theme.colors.border,
        borderTopWidth: 1,
        height: 88,
        paddingBottom: 28,
        paddingTop: 10,
      },
      tabBarActiveTintColor: theme.colors.redLight,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '600' as const },
    };

/** SF Symbol on iOS, Ionicon on Android. */
function tabIcon(sfSymbol: string, ionicon: React.ComponentProps<typeof Ionicons>['name']): any {
  if (NATIVE_TABS) return () => ({ sfSymbol });
  return ({ color, size }: { color: string; size: number }) => <Ionicons name={ionicon} size={size} color={color} />;
}

const DarkNavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bgPrimary,
    card: theme.colors.bgPrimary,
    text: theme.colors.textPrimary,
    border: theme.colors.border,
    notification: theme.colors.redPrimary,
    primary: theme.colors.redPrimary,
  },
};

/** Passes chat keys on to friends' new devices while the app is open (src/chat/useChat.ts). */
function ChatKeySharing() {
  useBackgroundKeySharing();
  return null;
}

function MainTabs({ onSwitchToCompany }: { onSwitchToCompany: () => void }) {
  const { t } = useTranslation();
  return (
    <>
    <ChatKeySharing />
    <Tab.Navigator
      {...tabNavigatorProps}
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.home'),
          tabBarIcon: tabIcon('house.fill', 'home'),
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarLabel: t('tabs.discover'),
          tabBarIcon: tabIcon('map.fill', 'map'),
        }}
      />
      {/*
        My Passport sits in the middle: stamps, the QR scanner, rooms played and the tower.
        Note: with BOOKING_ENABLED the bar has 6 tabs and iOS folds the last one into "More".
      */}
      <Tab.Screen
        name="PassportTab"
        options={{
          tabBarLabel: t('tabs.passport'),
          tabBarIcon: tabIcon('book.closed.fill', 'book'),
        }}
      >
        {() => <PassportScreen embedded />}
      </Tab.Screen>
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{
          tabBarLabel: t('tabs.social'),
          tabBarIcon: tabIcon('person.2.fill', 'people'),
        }}
      />
      {BOOKING_ENABLED && (
      <Tab.Screen
        name="Tickets"
        component={TicketsScreen}
        options={{
          // The route keeps its old name; players see "Bookings"
          tabBarLabel: t('tickets.tab'),
          tabBarIcon: tabIcon('ticket.fill', 'ticket'),
        }}
      />
      )}
      <Tab.Screen
        name="Profile"
        options={{
          tabBarLabel: t('tabs.profile'),
          tabBarIcon: tabIcon('person.fill', 'person'),
        }}
      >
{() => <ProfileScreen onSwitchToCompany={onSwitchToCompany} />}
      </Tab.Screen>
    </Tab.Navigator>
    </>
  );
}

export default function App() {
  const [appState, setAppState] = useState<'splash' | 'login' | 'onboarding' | 'main' | 'company' | 'companyAuth' | 'companyOnboarding'>('splash');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyToken, setCompanyToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // Required by file so only these three weights ship, not the whole family
  const [fontsLoaded, fontError] = useFonts({
    NotoSerifDisplay_700Bold: require('@expo-google-fonts/noto-serif-display/700Bold/NotoSerifDisplay_700Bold.ttf'),
    NotoSerifDisplay_900Black: require('@expo-google-fonts/noto-serif-display/900Black/NotoSerifDisplay_900Black.ttf'),
    SpecialElite_400Regular: require('@expo-google-fonts/special-elite/400Regular/SpecialElite_400Regular.ttf'),
  });

  // Check for existing session on app launch
  useEffect(() => {
    Promise.all([AsyncStorage.getItem('userId'), getToken(PLAYER_TOKEN_KEY)]).then(([storedUserId, storedToken]) => {
      if (storedUserId && storedToken) {
        setUserId(storedUserId);
        setSessionToken(storedToken);
      } else if (storedUserId) {
        // Logged in before server sessions existed: ask for a fresh login
        AsyncStorage.removeItem('userId');
      }
    });
  }, []);

  // Tell the server where to send pushes (convex/push.ts), once logged in.
  useEffect(() => {
    syncPlayerPush(sessionToken);
  }, [sessionToken]);
  useEffect(() => {
    syncCompanyPush(companyToken);
  }, [companyToken]);

  // Handle notification taps (navigate to Notifications screen)
  const navigationRef = React.useRef<any>(null);
  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      const nav = navigationRef.current;
      if (!nav) return;
      const data: any = response.notification.request.content.data || {};
      // Company pushes: the business app shows its own bookings.
      if (typeof data.type === 'string' && data.type.startsWith('company_')) return;
      if (data.kind === 'passport') {
        nav.navigate('Passport');
        return;
      }
      // Rooms Played (convex/plays.ts): verified, vouch requests, teammates.
      if (data.kind === 'plays' || data.kind === 'vouch' || data.kind === 'plays_teammate') {
        nav.navigate('Passport', { tab: 'played' });
        return;
      }
      // Offer or a time that became free: open that slot.
      if (data.roomId && data.date && data.time && (data.kind === 'offer' || data.type === 'slot_available')) {
        nav.navigate('DateTimeSelect', { id: data.roomId, date: data.date, time: data.time });
        return;
      }
      nav.navigate('Notifications');
    });
    return () => sub.remove();
  }, []);

  const handleLogin = async (id: string, sessionToken: string) => {
    await AsyncStorage.setItem('userId', id);
    await setToken(PLAYER_TOKEN_KEY, sessionToken);
    setUserId(id);
    setSessionToken(sessionToken);
    setCrashUser(id);
    const hasOnboarded = await AsyncStorage.getItem('hasOnboarded');
    setAppState(hasOnboarded ? 'main' : 'onboarding');
  };

  const handleLogout = async () => {
    await unregisterPush('player');
    const token = await getToken(PLAYER_TOKEN_KEY);
    if (token) convex.mutation(api.userSession.logout, { sessionToken: token }).catch(() => {});
    await removeToken(PLAYER_TOKEN_KEY);
    await AsyncStorage.removeItem('userId');
    setUserId(null);
    setSessionToken(null);
    setCrashUser(null);
    setAppState('login');
  };

  const handleSwitchToCompany = () => {
    if (companyId && companyToken) {
      setAppState('company');
    } else {
      // Logins from before company sessions existed have no token: log in again.
      loadCompanySession().then((session) => {
        if (session) {
          setCompanyId(session.companyId);
          setCompanyToken(session.token);
          setAppState('company');
        } else {
          setAppState('companyAuth');
        }
      });
    }
  };

  // The server rejected the business session (expired or revoked).
  const handleCompanySessionExpired = React.useCallback(() => {
    clearCompanySession(false);
    setCompanyId(null);
    setCompanyToken(null);
    setAppState('companyAuth');
  }, []);

  // Hold the first frame until the fonts are in; if they fail, carry on with system fonts.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }} />;
  }

  if (appState === 'splash') {
    return (
      <LanguageProvider>
      <ConvexProvider client={convex}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <StatusBar style="light" />
          <SplashScreen
            onComplete={async () => {
              // Load both sessions but always land on player app
              const storedCompanyId = await AsyncStorage.getItem('companyId');
              const storedUserId = await AsyncStorage.getItem('userId');
              if (storedUserId) {
                setUserId(storedUserId);
                setSessionToken(await getToken(PLAYER_TOKEN_KEY));
                setAppState('main');
              } else {
                setAppState('login');
              }
            }}
          />
        </View>
      </ConvexProvider>
      </LanguageProvider>
    );
  }

  if (appState === 'login') {
    return (
      <LanguageProvider>
      <ConvexProvider client={convex}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <StatusBar style="light" />
          <LoginScreen onLogin={handleLogin} />
        </View>
      </ConvexProvider>
      </LanguageProvider>
    );
  }

  if (appState === 'onboarding') {
    return (
      <LanguageProvider>
      <ConvexProvider client={convex}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <StatusBar style="light" />
          <Onboarding onComplete={async () => {
            await AsyncStorage.setItem('hasOnboarded', 'true');
            setAppState('main');
          }} userId={userId} sessionToken={sessionToken} />
        </View>
      </ConvexProvider>
      </LanguageProvider>
    );
  }

  if (appState === 'companyAuth') {
    return (
      <LanguageProvider>
      <ConvexProvider client={convex}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <StatusBar style="light" />
          <CompanyAuth
            onLogin={async (id, onboardingStatus, token) => {
              await saveCompanySession(id, token);
              setCompanyId(id);
              setCompanyToken(token);
              if (onboardingStatus && onboardingStatus !== 'approved') {
                setAppState('companyOnboarding');
              } else {
                setAppState('company');
              }
            }}
            onBack={() => {
              if (userId) {
                setAppState('main');
              } else {
                setAppState('login');
              }
            }}
          />
        </View>
      </ConvexProvider>
      </LanguageProvider>
    );
  }

  if (appState === 'companyOnboarding' && companyId) {
    return (
      <LanguageProvider>
      <ConvexProvider client={convex}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <StatusBar style="light" />
          <CompanySessionProvider token={companyToken} onExpired={handleCompanySessionExpired}>
          <CompanyOnboarding
            companyId={companyId}
            onComplete={() => setAppState('company')}
            onLogout={async () => {
              await clearCompanySession();
              setCompanyId(null);
              setCompanyToken(null);
              const storedUserId = await AsyncStorage.getItem('userId');
              if (storedUserId) {
                setUserId(storedUserId);
                setSessionToken(await getToken(PLAYER_TOKEN_KEY));
                setAppState('main');
              } else {
                setAppState('login');
              }
            }}
          />
          </CompanySessionProvider>
        </View>
      </ConvexProvider>
      </LanguageProvider>
    );
  }

  /* ── Notification watcher (must be inside ConvexProvider) ── */
  function NotificationWatcher({ userId, companyId, sessionToken }: { userId: string | null; companyId: string | null; sessionToken: string | null }) {
    useNotificationWatcher(userId, companyId, sessionToken);
    return null;
  }

  /* ── Company Tabs Navigator ── */
  function CompanyTabs() {
    const companyNav = useNavigation<any>();
    const { t } = useTranslation();
    return (
      <CompanyTab.Navigator
        {...tabNavigatorProps}
        screenOptions={tabScreenOptions}
      >
        <CompanyTab.Screen
          name="Today"
          options={{ tabBarLabel: t('tabs.today'), tabBarIcon: tabIcon('clock.fill', 'today-outline') }}
        >
          {() => <CompanyDashboard companyId={companyId!} onSwitchToPlayer={async () => {
            setCompanyId(null);
            const storedUserId = await AsyncStorage.getItem('userId');
            if (storedUserId) {
              setUserId(storedUserId);
              setSessionToken(await getToken(PLAYER_TOKEN_KEY));
              setAppState('main');
            } else {
              setAppState('login');
            }
          }} />}
        </CompanyTab.Screen>
        {BOOKING_ENABLED && (
        <CompanyTab.Screen
          name="Slots"
          options={{ tabBarLabel: t('tabs.slots'), tabBarIcon: tabIcon('square.grid.3x3.fill', 'grid-outline') }}
        >
          {() => <CompanySlots companyId={companyId!} />}
        </CompanyTab.Screen>
        )}
        {BOOKING_ENABLED && (
        <CompanyTab.Screen
          name="Calendar"
          options={{ tabBarLabel: t('tabs.calendar'), tabBarIcon: tabIcon('calendar', 'calendar') }}
        >
          {() => <CompanyBookings companyId={companyId!} />}
        </CompanyTab.Screen>
        )}
        <CompanyTab.Screen
          name="Rooms"
          options={{ tabBarLabel: t('tabs.rooms'), tabBarIcon: tabIcon('key.fill', 'key') }}
        >
          {() => <CompanyRoomsList companyId={companyId!} />}
        </CompanyTab.Screen>
        <CompanyTab.Screen
          name="Settings"
          options={{ tabBarLabel: t('tabs.settings'), tabBarIcon: tabIcon('gearshape.fill', 'settings') }}
        >
          {() => (
            <CompanySettings
              companyId={companyId!}
              onNavigateBilling={() => companyNav.navigate('CompanyBilling', { companyId: companyId! })}
              onNavigatePhotos={() => companyNav.navigate('CompanyPhotos', { companyId: companyId! })}
              onNavigatePayments={() => companyNav.navigate('CompanyPayments', { companyId: companyId! })}
              onNavigateMerch={() => companyNav.navigate('CompanyMerch', { companyId: companyId! })}
              onNavigateJobs={() => companyNav.navigate('CompanyJobs')}
              onNavigateNotifPrefs={() => companyNav.navigate('CompanyNotificationPrefs')}
              onNavigateGuide={() => companyNav.navigate('CompanyGuide')}
              onNavigateTerms={() => companyNav.navigate('TermsOfService')}
              onNavigatePrivacy={() => companyNav.navigate('PrivacyPolicy')}
              onSwitchToPlayer={async () => {
                setCompanyId(null);
                const storedUserId = await AsyncStorage.getItem('userId');
                if (storedUserId) {
                  setUserId(storedUserId);
                  setSessionToken(await getToken(PLAYER_TOKEN_KEY));
                  setAppState('main');
                } else {
                  setAppState('login');
                }
              }}
              onLogout={async () => {
                await clearCompanySession();
                setCompanyId(null);
                setCompanyToken(null);
                const storedUserId = await AsyncStorage.getItem('userId');
                if (storedUserId) {
                  setUserId(storedUserId);
                  setSessionToken(await getToken(PLAYER_TOKEN_KEY));
                  setAppState('main');
                } else {
                  setAppState('login');
                }
              }}
            />
          )}
        </CompanyTab.Screen>
      </CompanyTab.Navigator>
    );
  }

  return (
    <ErrorBoundary>
    <LanguageProvider>
    <ConvexProvider client={convex}>
      <UserProvider userId={userId} sessionToken={sessionToken} onLogout={handleLogout} onSwitchToCompany={handleSwitchToCompany}>
      <CompanySessionProvider token={companyToken} onExpired={handleCompanySessionExpired}>
        <View style={{ flex: 1 }}>
          <StatusBar style="light" />
          {/* A failing background query here must never take the whole app down */}
          <ErrorBoundary fallback={null}>
            <NotificationWatcher userId={userId} companyId={companyId} sessionToken={sessionToken} />
          </ErrorBoundary>
          <NavigationContainer ref={navigationRef} theme={DarkNavTheme}>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.bgPrimary },
                animation: 'slide_from_right',
              }}
            >
              {appState === 'company' && companyId ? (
                <>
                  <Stack.Screen name="CompanyTabs" component={CompanyTabs} />
                  <Stack.Screen name="CompanyRoomEditor">
                    {(props) => <CompanyRoomEditor {...props} companyId={companyId} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyAvailability" component={CompanyAvailability} />
                  <Stack.Screen name="CompanyBookingDetail">
                    {(props) => <CompanyBookingDetail {...(props as any)} companyId={companyId} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyAddBooking">
                    {(props) => <CompanyAddBooking {...(props as any)} companyId={companyId} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyPhotos">
                    {() => <CompanyPhotos companyId={companyId} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyPassport">
                    {() => <CompanyPassport companyId={companyId} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyGuide">
                    {(props) => <CompanyGuide onBack={() => (props as any).navigation.goBack()} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyNotificationPrefs">
                    {(props) => <CompanyNotificationPrefs onBack={() => (props as any).navigation.goBack()} />}
                  </Stack.Screen>
                  <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
                  <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
                  <Stack.Screen name="CompanyPayments">
                    {(props) => <CompanyPayments companyId={companyId} onBack={() => (props as any).navigation.goBack()} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyMerch">
                    {(props) => (
                      <CompanyMerch
                        companyId={companyId}
                        onBack={() => (props as any).navigation.goBack()}
                        onEditItem={(productId) => (props as any).navigation.navigate('CompanyMerchEditor', { companyId, productId })}
                        onNavigatePayments={() => (props as any).navigation.navigate('CompanyPayments', { companyId })}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyMerchEditor">
                    {(props) => (
                      <CompanyMerchEditor
                        companyId={companyId}
                        productId={(props as any).route.params?.productId}
                        onBack={() => (props as any).navigation.goBack()}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyBilling">
                    {(props) => <CompanyBilling companyId={companyId} onBack={() => (props as any).navigation.goBack()} />}
                  </Stack.Screen>
                  <Stack.Screen name="CompanyJobs">
                    {(props) => <CompanyJobs onBack={() => (props as any).navigation.goBack()} />}
                  </Stack.Screen>
                </>
              ) : (
                <>
                  <Stack.Screen name="MainTabs">
                    {() => <MainTabs onSwitchToCompany={handleSwitchToCompany} />}
                  </Stack.Screen>
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="Friends" component={FriendsScreen} />
                  <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
                  <Stack.Screen name="RoomDetails" component={RoomDetails} />
                  <Stack.Screen name="PlayerProfile" component={PlayerProfileScreen} />
                  <Stack.Screen name="Messages" component={MessagesScreen} />
                  <Stack.Screen name="Chat" component={ChatScreen} />
                  <Stack.Screen name="Companies" component={CompaniesScreen} />
                  <Stack.Screen name="CompanyProfile" component={CompanyProfileScreen} />
                  <Stack.Screen name="Passport" component={PassportScreen} />
                  <Stack.Screen name="ScanStamp" component={ScanStampScreen} />
                  <Stack.Screen name="AddPlay" component={AddPlayScreen} />
                  <Stack.Screen name="PlayedRoom" component={PlayedRoomScreen} />
                  <Stack.Screen name="Tower" component={TowerScreen} options={{ animation: 'fade', gestureEnabled: false }} />
                  <Stack.Screen name="Jobs" component={JobsScreen} />
                  <Stack.Screen name="DateTimeSelect" component={DateTimeSelect} />
                  <Stack.Screen name="Checkout" component={Checkout} />
                  <Stack.Screen name="BookingConfirmation" component={BookingConfirmation} options={{ gestureEnabled: false }} />
                  <Stack.Screen name="MapView" component={MapViewScreen} />
                  <Stack.Screen name="Premium" getComponent={() => require('./src/screens/PremiumScreen').default} />
                  <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
                  <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
                  <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} />
                  <Stack.Screen name="PlayerSettings" component={PlayerSettings} />
                  <Stack.Screen name="ProfileMore">
                    {() => <ProfileScreen mode="more" onSwitchToCompany={handleSwitchToCompany} />}
                  </Stack.Screen>
                  <Stack.Screen name="Shop" component={ShopScreen} />
                  <Stack.Screen name="Product" component={ProductScreen} />
                  <Stack.Screen name="Cart" component={CartScreen} />
                  <Stack.Screen name="MerchCheckout" component={MerchCheckoutScreen} />
                  <Stack.Screen name="MerchOrders" component={MerchOrdersScreen} />
                  <Stack.Screen name="MerchOrder" component={MerchOrderScreen} />
                  <Stack.Screen name="CompanyAuth">
                    {() => (
                      <CompanyAuth
                        onLogin={async (id, onboardingStatus, token) => {
                          await saveCompanySession(id, token);
                          setCompanyId(id);
                          setCompanyToken(token);
                          if (onboardingStatus && onboardingStatus !== 'approved') {
                            setAppState('companyOnboarding');
                          } else {
                            setAppState('company');
                          }
                        }}
                        onBack={() => {}}
                      />
                    )}
                  </Stack.Screen>
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </CompanySessionProvider>
      </UserProvider>
    </ConvexProvider>
    </LanguageProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  scanBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: theme.colors.redPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
