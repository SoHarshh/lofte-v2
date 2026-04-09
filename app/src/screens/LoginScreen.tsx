import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { useSSO, useSignIn, useSignUp, useClerk } from '@clerk/expo';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'signin' | 'signup' | 'verify';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { startSSOFlow } = useSSO();
  const { signIn, setActive: setSignInActive } = useSignIn();
  const { signUp, setActive: setSignUpActive } = useSignUp();
  const clerk = useClerk() as any;

  // --- OAuth ---
  const handleSSO = async (strategy: 'oauth_apple' | 'oauth_google') => {
    try {
      setLoading(true);
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: Linking.createURL('/'),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.errors?.[0]?.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Email sign in ---
  const handleSignIn = async () => {
    if (!signIn) return;
    setLoading(true);
    try {
      await signIn.create({ identifier: email });
      const rawSignIn = clerk?.client?.signIn;
      await rawSignIn.attemptFirstFactor({ strategy: 'password', password });
      if (rawSignIn.status === 'complete' && rawSignIn.createdSessionId) {
        await setSignInActive({ session: rawSignIn.createdSessionId });
      } else {
        Alert.alert('Sign in failed', 'Please check your email and password.');
      }
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  // --- Email sign up ---
  const handleSignUp = async () => {
    if (!signUp) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password, firstName, lastName });
      if (signUp.status === 'complete') {
        await clerk.setActive({ session: signUp.createdSessionId });
      } else if (signUp.status === 'missing_requirements') {
        // Email verification required — send code and show verify screen
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setMode('verify');
      } else {
        Alert.alert('Sign up failed', 'Please check your details and try again.');
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message ?? JSON.stringify(err);
      Alert.alert('Sign up failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Verify email ---
  const handleVerify = async () => {
    if (!signUp) return;
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      Alert.alert('Invalid code', err?.errors?.[0]?.longMessage ?? 'Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Verify screen ---
  if (mode === 'verify') {
    return (
      <View style={s.root}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.iconCircle}>
              <Ionicons name="mail-outline" size={32} color="rgba(255,255,255,0.8)" />
            </View>
            <Text style={[s.title, { fontFamily: SERIF }]}>Check your email</Text>
            <Text style={s.subtitle}>We sent a 6-digit code to {email}</Text>

            <View style={s.card}>
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
              <TextInput
                style={s.input}
                placeholder="Enter verification code"
                placeholderTextColor="rgba(255,255,255,0.28)"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                selectionColor="rgba(255,255,255,0.5)"
              />
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#050B14" />
                : <Text style={s.primaryBtnText}>Verify</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode('signup')} style={s.linkBtn}>
              <Text style={s.linkText}>← Go back</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  const isSignIn = mode === 'signin';

  return (
    <View style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Text style={[s.title, { fontFamily: SERIF }]}>LOFTE</Text>
          <Text style={s.subtitle}>
            {isSignIn ? 'Welcome back' : 'Create your account'}
          </Text>

          {/* OAuth buttons */}
          <View style={s.oauthGroup}>
            <TouchableOpacity
              style={s.oauthBtn}
              onPress={() => handleSSO('oauth_apple')}
              activeOpacity={0.8}
            >
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
              <Ionicons name="logo-apple" size={20} color="#fff" />
              <Text style={s.oauthBtnText}>Continue with Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.oauthBtn}
              onPress={() => handleSSO('oauth_google')}
              activeOpacity={0.8}
            >
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
              <Ionicons name="logo-google" size={18} color="#fff" />
              <Text style={s.oauthBtnText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {/* First + Last name (sign up only) */}
          {!isSignIn && (
            <View style={[s.card, { marginBottom: 12 }]}>
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="First name"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  selectionColor="rgba(255,255,255,0.5)"
                />
                <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 12 }} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Last name"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  selectionColor="rgba(255,255,255,0.5)"
                />
              </View>
            </View>
          )}

          {/* Email + password */}
          <View style={s.card}>
            <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />

            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              selectionColor="rgba(255,255,255,0.5)"
            />
            <View style={s.inputDivider} />
            <View style={s.passwordRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.28)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                selectionColor="rgba(255,255,255,0.5)"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="rgba(255,255,255,0.40)"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Primary action */}
          <TouchableOpacity
            style={[s.primaryBtn, (loading || !email || !password || (!isSignIn && (!firstName || !lastName))) && { opacity: 0.5 }]}
            onPress={isSignIn ? handleSignIn : handleSignUp}
            disabled={loading || !email || !password || (!isSignIn && (!firstName || !lastName))}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#050B14" />
              : <Text style={s.primaryBtnText}>{isSignIn ? 'Sign In' : 'Create Account'}</Text>}
          </TouchableOpacity>

          {/* Toggle */}
          <TouchableOpacity
            onPress={() => setMode(isSignIn ? 'signup' : 'signin')}
            style={s.linkBtn}
          >
            <Text style={s.linkText}>
              {isSignIn ? "Don't have an account? " : 'Already have an account? '}
              <Text style={s.linkTextBold}>{isSignIn ? 'Sign up' : 'Sign in'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: 24, alignItems: 'stretch' },

  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 40, fontWeight: '400', color: '#fff',
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.45)',
    textAlign: 'center', marginBottom: 36,
  },

  oauthGroup: { gap: 10, marginBottom: 24 },
  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 15, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  oauthBtnText: { fontSize: 15, fontWeight: '600', color: '#fff', zIndex: 1 },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  dividerText: { fontSize: 13, color: 'rgba(255,255,255,0.30)' },

  card: {
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden', marginBottom: 16,
  },
  input: {
    fontSize: 15, color: '#fff',
    paddingHorizontal: 16, paddingVertical: 16,
    zIndex: 1,
  },
  inputDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 16 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  eyeBtn: { paddingHorizontal: 16, paddingVertical: 16 },

  primaryBtn: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginBottom: 16,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#050B14' },

  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  linkTextBold: { color: 'rgba(255,255,255,0.80)', fontWeight: '600' },
});
