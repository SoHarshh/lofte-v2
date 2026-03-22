import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionState } from './src/types';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SessionScreen from './src/screens/SessionScreen';

const Tab = createBottomTabNavigator();

export const COLORS = {
  bg: '#0A0A0A',
  accent: '#7C3AED',
  accentDim: '#4C1D95',
  surface: '#141414',
  border: '#222222',
  text: '#FFFFFF',
  textDim: '#888888',
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

  const startSession = () => {
    setSession({
      isActive: true,
      startTime: new Date().toISOString(),
      transcript: [],
      exercises: [],
      notes: '',
    });
  };

  const endSession = () => {
    setSession(initialSession);
  };

  const updateSession = (updates: Partial<SessionState>) => {
    setSession(prev => ({ ...prev, ...updates }));
  };

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
            tabBarLabel: ({ color }) => (
              <Text style={{ color, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                {route.name}
              </Text>
            ),
            tabBarIcon: ({ color }) => {
              const icons: Record<string, string> = {
                Dashboard: '⚡',
                Session: session.isActive ? '🔴' : '●',
                History: '📋',
              };
              return (
                <Text style={{ fontSize: 18 }}>{icons[route.name]}</Text>
              );
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
    backgroundColor: '#111111',
    borderTopColor: '#222222',
    borderTopWidth: 1,
    height: 85,
    paddingTop: 8,
  },
});
