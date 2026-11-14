import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ConvexProvider } from 'convex/react';
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList, MainTabParamList, CompanyTabParamList } from './src/types';
import { theme } from './src/theme';
import { convex } from './src/convex';
import {
  CompanySessionProvider,
  saveCompanySession,
  loadCompanySession,
  clearCompanySession,
} from './src/companySession';
import { UserProvider } from './src/UserContext';
import { LanguageProvider, useTranslation } from './src/i18n';
import { registerForPushNotificationsAsync, addNotificationResponseListener } from './src/notifications';
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
import DateTimeSelect from './src/screens/DateTimeSelect';
import Checkout from './src/screens/Checkout';
import BookingConfirmation from './src/screens/BookingConfirmation';
import MapViewScreen from './src/screens/MapView';
import SocialScreen from './src/screens/SocialScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';

// Legal & Settings Screens (Apple Guidelines compliance)
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/TermsOfServiceScreen';
import NotificationPrefsScreen from './src/screens/NotificationPrefsScreen';

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
import AdminReview from './src/screens/AdminReview';

const Stack = createNativeStackNavigator<RootStackParamList>();
/**
 * iOS uses the system tab bar (UITabBarController), so on iOS 26 it is Apple's
 * Liquid Glass bar and on older versions the standard translucent one.
 * Android keeps the JS tab bar.
 */
const NATIVE_TABS = Platform.OS === 'ios';
const Tab: any = NATIVE_TABS
  ? createNativeBottomTabNavigator<MainTabParamList>()
  : createBottomTabNavigator<MainTabParamList>();
const CompanyTab: any = NATIVE_TABS
  ? createNativeBottomTabNavigator<CompanyTabParamList>()
  : createBottomTabNavigator<CompanyTabParamList>();

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

function MainTabs({ onSwitchToCompany, onAdminReview }: { onSwitchToCompany: () => void; onAdminReview: () => void }) {
  const { t } = useTranslation();
  return (
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
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{
          tabBarLabel: t('tabs.social'),
          tabBarIcon: tabIcon('person.2.fill', 'people'),
        }}
      />
      <Tab.Screen
        name="Tickets"
        component={TicketsScreen}
        options={{
          // The route keeps its old name; players see "Bookings"
          tabBarLabel: t('tickets.tab'),
          tabBarIcon: tabIcon('ticket.fill', 'ticket'),
        }}
      />
      <Tab.Screen
        name="Profile"
        options={{
          tabBarLabel: t('tabs.profile'),
          tabBarIcon: tabIcon('person.fill', 'person'),
        }}
      >
        {() => <ProfileScreen onSwitchToCompany={onSwitchToCompany} onAdminReview={onAdminReview} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [appState, setAppState] = useState<'splash' | 'login' | 'onboarding' | 'main' | 'company' | 'companyAuth' | 'companyOnboarding' | 'adminReview'>('splash');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyToken, setCompanyToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Required by file so only these three weights ship, not the whole family
  const [fontsLoaded, fontError] = useFonts({
    NotoSerifDisplay_700Bold: require('@expo-google-fonts/noto-serif-display/700Bold/NotoSerifDisplay_700Bold.ttf'),
    NotoSerifDisplay_900Black: require('@expo-google-fonts/noto-serif-display/900Black/NotoSerifDisplay_900Black.ttf'),
    SpecialElite_400Regular: require('@expo-google-fonts/special-elite/400Regular/SpecialElite_400Regular.ttf'),
  });

  // Check for existing session on app launch
  useEffect(() => {
    AsyncStorage.getItem('userId').then((storedUserId) => {
      if (storedUserId) {
        setUserId(storedUserId);
      }
    });
  }, []);

  // Register for push notifications on mount
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // Handle notification taps (navigate to Notifications screen)
  const navigationRef = React.useRef<any>(null);
  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      // Navigate to notifications screen when user taps a notification
      if (navigationRef.current) {
        navigationRef.current.navigate('Notifications');
      }
    });
    return () => sub.remove();
  }, []);

  const handleLogin = async (id: string) => {
    await AsyncStorage.setItem('userId', id);
    setUserId(id);
    setCrashUser(id);
    const hasOnboarded = await AsyncStorage.getItem('hasOnboarded');
    setAppState(hasOnboarded ? 'main' : 'onboarding');
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userId');
    setUserId(null);
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
          }} userId={userId} />
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

  if (appState === 'adminReview') {
    return (
      <LanguageProvider>
      <ConvexProvider client={convex}>
        <UserProvider userId={userId} onLogout={handleLogout} onSwitchToCompany={handleSwitchToCompany}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <StatusBar style="light" />
          <AdminReview onBack={() => setAppState('main')} />
        </View>
        </UserProvider>
      </ConvexProvider>
      </LanguageProvider>
    );
  }

  /* ── Notification watcher (must be inside ConvexProvider) ── */
  function NotificationWatcher({ userId, companyId }: { userId: string | null; companyId: string | null }) {
    useNotificationWatcher(userId, companyId);
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
              setAppState('main');
            } else {
              setAppState('login');
            }
          }} />}
        </CompanyTab.Screen>
        <CompanyTab.Screen
          name="Calendar"
          options={{ tabBarLabel: t('tabs.calendar'), tabBarIcon: tabIcon('calendar', 'calendar') }}
        >
          {() => <CompanyBookings companyId={companyId!} />}
        </CompanyTab.Screen>
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
              onSwitchToPlayer={async () => {
                setCompanyId(null);
                const storedUserId = await AsyncStorage.getItem('userId');
                if (storedUserId) {
                  setUserId(storedUserId);
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
      <UserProvider userId={userId} onLogout={handleLogout} onSwitchToCompany={handleSwitchToCompany}>
      <CompanySessionProvider token={companyToken} onExpired={handleCompanySessionExpired}>
        <View style={{ flex: 1 }}>
          <StatusBar style="light" />
          <NotificationWatcher userId={userId} companyId={companyId} />
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
                  <Stack.Screen name="CompanyBilling">
                    {(props) => <CompanyBilling companyId={companyId} onBack={() => (props as any).navigation.goBack()} />}
                  </Stack.Screen>
                </>
              ) : (
                <>
                  <Stack.Screen name="MainTabs">
                    {() => <MainTabs onSwitchToCompany={handleSwitchToCompany} onAdminReview={() => setAppState('adminReview')} />}
                  </Stack.Screen>
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="Friends" component={FriendsScreen} />
                  <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
                  <Stack.Screen name="RoomDetails" component={RoomDetails} />
                  <Stack.Screen name="DateTimeSelect" component={DateTimeSelect} />
                  <Stack.Screen name="Checkout" component={Checkout} />
                  <Stack.Screen name="BookingConfirmation" component={BookingConfirmation} options={{ gestureEnabled: false }} />
                  <Stack.Screen name="MapView" component={MapViewScreen} />
                  <Stack.Screen name="Premium" getComponent={() => require('./src/screens/PremiumScreen').default} />
                  <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
                  <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
                  <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} />
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
