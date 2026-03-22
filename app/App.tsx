import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SessionState } from './src/types';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SessionScreen from './src/screens/SessionScreen';

const Tab = createBottomTabNavigator();

export const COLORS = {
  bg: '#0A0A0A',
  accent: '#7C3AED',
  accentDim: '#3B0764',
  surface: '#141414',
  border: '#1F1F1F',
  text: '#FFFFFF',
  textDim: '#666666',
  success: '#10B981',
  danger: '#EF4444',
};

const initialSession: SessionState = {
  isActive: false,
  startTime: null,
  transcript: [],
  exercises: [],
  notes: '',
};

export default function App() {
  const [session, setSession] = useState<SessionState>(initialSession);

  const startSession = () => setSession({
    isActive: true,
    startTime: new Date().toISOString(),
    transcript: [], exercises: [], notes: '',
  });

  const endSession = () => setSession(initialSession);

  const updateSession = (updates: Partial<SessionState>) =>
    setSession(prev => ({ ...prev, ...updates }));

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: COLORS.accent,
            tabBarInactiveTintColor: COLORS.textDim,
            tabBarShowLabel: true,
            tabBarLabelStyle: styles.tabLabel,
            tabBarIcon: ({ color, size }) => {
              const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
                Dashboard: 'stats-chart',
                Session: session.isActive ? 'radio-button-on' : 'add-circle',
                History: 'time-outline',
              };
              return <Ionicons name={icons[route.name]} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Dashboard">
            {() => <DashboardScreen colors={COLORS} />}
          </Tab.Screen>
          <Tab.Screen name="Session">
            {() => (
              <SessionScreen
                session={session}
                onStart={startSession}
                onEnd={endSession}
                onUpdate={updateSession}
                colors={COLORS}
              />
            )}
          </Tab.Screen>
          <Tab.Screen name="History">
            {() => <HistoryScreen colors={COLORS} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0F0F0F',
    borderTopColor: '#1F1F1F',
    borderTopWidth: 1,
    height: 88,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
