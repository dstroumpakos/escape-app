import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ConvexProvider } from 'convex/react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList, MainTabParamList, CompanyTabParamList } from './src/types';
import { theme } from './src/theme';
import { convex } from './src/convex';
import { UserProvider } from './src/UserContext';
import { LanguageProvider } from './src/i18n';

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
import ScanScreen from './src/screens/ScanScreen';
import SocialScreen from './src/screens/SocialScreen';

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

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const CompanyTab = createBottomTabNavigator<CompanyTabParamList>();

const DarkNavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bgPrimary,
    card: theme.colors.bgPrimary,
    text: '#FFFFFF',
    border: theme.colors.border,
    notification: theme.colors.redPrimary,
    primary: theme.colors.redPrimary,
  },
};

function MainTabs({ onSwitchToCompany }: { onSwitchToCompany: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(26, 13, 13, 0.95)',
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 28,
          paddingTop: 10,
        },
        tabBarActiveTintColor: theme.colors.redPrimary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' as const },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Tickets"
        component={TicketsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="ticket" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      >
        {() => <ProfileScreen onSwitchToCompany={onSwitchToCompany} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [appState, setAppState] = useState<'splash' | 'login' | 'onboarding' | 'main' | 'company' | 'companyAuth'>('splash');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Check for existing session on app launch
  useEffect(() => {
    AsyncStorage.getItem('userId').then((storedUserId) => {
      if (storedUserId) {
        setUserId(storedUserId);
      }
    });
  }, []);

  const handleLogin = async (id: string) => {
    await AsyncStorage.setItem('userId', id);
    setUserId(id);
    setAppState('onboarding');
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userId');
    setUserId(null);
    setAppState('login');
  };

  const handleSwitchToCompany = () => {
    if (companyId) {
      setAppState('company');
    } else {
      AsyncStorage.getItem('companyId').then((storedId) => {
        if (storedId) {
          setCompanyId(storedId);
          setAppState('company');
        } else {
          setAppState('companyAuth');
        }
      });
    }
  };

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
          <Onboarding onComplete={() => setAppState('main')} userId={userId} />
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
            onLogin={async (id) => {
              await AsyncStorage.setItem('companyId', id);
              setCompanyId(id);
              setAppState('company');
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

  /* ── Company Tabs Navigator ── */
  function CompanyTabs() {
    return (
      <CompanyTab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: 'rgba(26, 13, 13, 0.95)',
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            height: 88,
            paddingBottom: 28,
            paddingTop: 10,
          },
          tabBarActiveTintColor: theme.colors.redPrimary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' as const },
        }}
      >
        <CompanyTab.Screen
          name="Today"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" size={size} color={color} /> }}
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
          options={{ tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }}
        >
          {() => <CompanyBookings companyId={companyId!} />}
        </CompanyTab.Screen>
        <CompanyTab.Screen
          name="Rooms"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons name="key" size={size} color={color} /> }}
        >
          {() => <CompanyRoomsList companyId={companyId!} />}
        </CompanyTab.Screen>
        <CompanyTab.Screen
          name="Settings"
          options={{ tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }}
        >
          {() => (
            <CompanySettings
              companyId={companyId!}
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
                await AsyncStorage.removeItem('companyId');
                setCompanyId(null);
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
    <LanguageProvider>
    <ConvexProvider client={convex}>
      <UserProvider userId={userId} onLogout={handleLogout} onSwitchToCompany={handleSwitchToCompany}>
        <View style={{ flex: 1 }}>
          <StatusBar style="light" />
          <NavigationContainer theme={DarkNavTheme}>
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
                </>
              ) : (
                <>
                  <Stack.Screen name="MainTabs">
                    {() => <MainTabs onSwitchToCompany={handleSwitchToCompany} />}
                  </Stack.Screen>
                  <Stack.Screen name="RoomDetails" component={RoomDetails} />
                  <Stack.Screen name="DateTimeSelect" component={DateTimeSelect} />
                  <Stack.Screen name="Checkout" component={Checkout} />
                  <Stack.Screen name="BookingConfirmation" component={BookingConfirmation} options={{ gestureEnabled: false }} />
                  <Stack.Screen name="MapView" component={MapViewScreen} />
                  <Stack.Screen name="CompanyAuth">
                    {() => (
                      <CompanyAuth
                        onLogin={async (id) => {
                          await AsyncStorage.setItem('companyId', id);
                          setCompanyId(id);
                          setAppState('company');
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
      </UserProvider>
    </ConvexProvider>
    </LanguageProvider>
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
