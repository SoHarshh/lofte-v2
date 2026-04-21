import React, { useState, useRef, useEffect } from 'react';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { SessionState } from './src/types/index';
import { AppBackground } from './src/components/AppBackground';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SessionScreen from './src/screens/SessionScreen';
import CoachScreen from './src/screens/CoachScreen';
import CalorieDetailScreen from './src/screens/CalorieDetailScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import BiologyScreen from './src/screens/BiologyScreen';
import LoginScreen from './src/screens/LoginScreen';
import { DnaIcon } from './src/components/DnaIcon';

const CLERK_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  'pk_test_c2V0dGxlZC1tb29zZS0yNC5jbGVyay5hY2NvdW50cy5kZXYk';

const Tab = createBottomTabNavigator();

export const COLORS = {
  bg: '#050B14',
  accent: '#7C3AED',
  accentDim: 'rgba(124,58,237,0.15)',
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.45)',
  textMuted: 'rgba(255,255,255,0.25)',
  success: '#10B981',
  danger: '#EF4444',
  amber: '#F59E0B',
};

const initialSession: SessionState = {
  isActive: false,
  startTime: null,
  transcript: [],
  exercises: [],
  notes: '',
};

function FadeScreen({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();
  const opacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Stop any in-progress animation to prevent jitter on rapid switches
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }

    const anim = Animated.timing(opacity, {
      toValue: isFocused ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) animRef.current = null;
    });
  }, [isFocused]);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      {children}
    </Animated.View>
  );
}

function FloatingTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const currentRoute = state.routes[state.index]?.name;

  // Hide tab bar on full-screen Session and Coach screens
  if (currentRoute === 'Session' || currentRoute === 'Coach' || currentRoute === 'CalorieDetail' || currentRoute === 'Calendar') return null;

  const mainTabs = [
    { name: 'Home', activeIcon: 'home' as const, inactiveIcon: 'home-outline' as const },
    { name: 'History', activeIcon: 'time' as const, inactiveIcon: 'time-outline' as const },
    { name: 'Biology', custom: 'dna' as const },
    { name: 'Profile', activeIcon: 'person' as const, inactiveIcon: 'person-outline' as const },
  ];

  return (
    <View
      style={[styles.tabContainer, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}
      pointerEvents="box-none"
    >
      {/* Main pill */}
      <View style={styles.tabPill} pointerEvents="box-none">
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
        {mainTabs.map((tab: any) => {
          const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
          const isFocused = state.index === routeIndex;
          return (
            <TouchableOpacity
              key={tab.name}
              style={[styles.tabBtn, isFocused && styles.tabBtnActive]}
              onPress={() => navigation.navigate(tab.name)}
              activeOpacity={0.7}
            >
              {tab.custom === 'dna' ? (
                <DnaIcon
                  size={22}
                  color={isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.40)'}
                />
              ) : (
                <Ionicons
                  name={isFocused ? tab.activeIcon : tab.inactiveIcon}
                  size={22}
                  color={isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.40)'}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Coach FAB */}
      <TouchableOpacity
        style={styles.coachFab}
        onPress={() => navigation.navigate('Coach')}
        activeOpacity={0.8}
      >
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
        <Ionicons name="sparkles" size={20} color="rgba(255,255,255,0.85)" />
      </TouchableOpacity>
    </View>
  );
}

function MainApp() {
  const [session, setSession] = useState<SessionState>(initialSession);
  const { isSignedIn, isLoaded } = useAuth();

  const startSession = () =>
    setSession({ isActive: true, startTime: new Date().toISOString(), transcript: [], exercises: [], notes: '' });
  const endSession = () => setSession(initialSession);
  const updateSession = (updates: Partial<SessionState>) =>
    setSession(prev => ({ ...prev, ...updates }));

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
        sceneContainerStyle={{ backgroundColor: 'transparent' }}
      >
        <Tab.Screen name="Home">
          {() => <FadeScreen><DashboardScreen colors={COLORS} sessionActive={session.isActive} /></FadeScreen>}
        </Tab.Screen>
        <Tab.Screen name="History">
          {() => <FadeScreen><HistoryScreen colors={COLORS} /></FadeScreen>}
        </Tab.Screen>
        <Tab.Screen name="Biology">
          {() => <FadeScreen><BiologyScreen colors={COLORS} /></FadeScreen>}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {() => <FadeScreen><ProfileScreen colors={COLORS} /></FadeScreen>}
        </Tab.Screen>
        <Tab.Screen name="Session">
          {() => (
            <FadeScreen>
              <SessionScreen
                session={session}
                onStart={startSession}
                onEnd={endSession}
                onUpdate={updateSession}
                colors={COLORS}
              />
            </FadeScreen>
          )}
        </Tab.Screen>
        <Tab.Screen name="Coach">
          {() => <FadeScreen><CoachScreen colors={COLORS} /></FadeScreen>}
        </Tab.Screen>
        <Tab.Screen name="CalorieDetail">
          {() => <FadeScreen><CalorieDetailScreen colors={COLORS} /></FadeScreen>}
        </Tab.Screen>
        <Tab.Screen name="Calendar">
          {() => <FadeScreen><CalendarScreen colors={COLORS} /></FadeScreen>}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppBackground>
          <MainApp />
        </AppBackground>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent',
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 6,
    overflow: 'hidden',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 100,
    zIndex: 1,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  coachFab: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 1,
  },
});
