import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator,
} from 'react-native';
import { useSSO, useClerk, useAuth } from '@clerk/expo';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

import { FONT_SEMIBOLD } from '../utils/fonts';
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif'; // LOFTE brand wordmark only
const SYSTEM = FONT_SEMIBOLD;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const { isLoaded: authLoaded } = useAuth();

  // Direct access to the Clerk client — always available once Clerk is loaded.
  const signIn = clerk?.client?.signIn;
  const signUp = clerk?.client?.signUp;

  // Activate a session via the top-level Clerk instance so useAuth() refreshes.
  const activateSession = async (sessionId: string | null | undefined) => {
    if (!sessionId || !clerk?.setActive) return false;
    await clerk.setActive({ session: sessionId });
    return true;
  };

  // --- OAuth ---
  const handleSSO = async (strategy: 'oauth_apple' | 'oauth_google') => {
    try {
      setLoading(true);
      const ssoResult: any = await startSSOFlow({
        strategy,
        redirectUrl: Linking.createURL('/'),
      });
      console.log('[SSO]', strategy, 'result:', JSON.stringify({
        createdSessionId: ssoResult?.createdSessionId,
        signUpStatus: ssoResult?.signUp?.status,
        signInStatus: ssoResult?.signIn?.status,
      }));

      // Happy path: existing user, session ready
      if (ssoResult?.createdSessionId) {
        await activateSession(ssoResult.createdSessionId);
        return;
      }

      // New user via SSO: complete the signUp
      const ssoSignUp = ssoResult?.signUp;
      if (ssoSignUp) {
        // If Apple didn't return email or other required fields, we can't auto-complete.
        // Try to finalize — Clerk will auto-fill what it can from the OAuth provider.
        try {
          if (ssoSignUp.status === 'missing_requirements') {
            await ssoSignUp.update({});
          }
        } catch (e) {
          console.log('[SSO] signUp.update failed (ok if not needed):', e);
        }

        if (ssoSignUp.createdSessionId) {
          await activateSession(ssoSignUp.createdSessionId);
          return;
        }
        Alert.alert(
          'Almost there',
          'Your Apple account needs a bit more info. Try signing up with email, or grant name/email when prompted.'
        );
        return;
      }

      // Existing user needing extra steps
      const ssoSignIn = ssoResult?.signIn;
      if (ssoSignIn?.createdSessionId) {
        await activateSession(ssoSignIn.createdSessionId);
        return;
      }

      Alert.alert('Sign in failed', 'No session returned by Apple. Try again.');
    } catch (err: any) {
      console.error('[SSO error]', JSON.stringify(err));
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message ?? 'Try again.';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Email sign in ---
  const handleSignIn = async () => {
    if (!authLoaded || !signIn) {
      Alert.alert('Hold on', 'Auth is still loading — try again in a sec.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim().toLowerCase(),
        password,
      });
      console.log('[SignIn] status:', result.status, 'sessionId:', result.createdSessionId);
      if (result.status === 'complete' && result.createdSessionId) {
        await activateSession(result.createdSessionId);
        return;
      }
      Alert.alert('Sign in failed', `Unexpected status: ${result.status}`);
    } catch (err: any) {
      console.error('[SignIn error]', JSON.stringify(err));
      Alert.alert(
        'Sign in failed',
        err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message ?? 'Check your email and password.'
      );
    } finally {
      setLoading(false);
    }
  };

  // --- Email sign up ---
  const handleSignUp = async () => {
    if (!authLoaded || !signUp) {
      Alert.alert('Hold on', 'Auth is still loading — try again in a sec.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp.create({
        emailAddress: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      console.log('[SignUp] status:', result.status);
      if (result.status === 'complete' && result.createdSessionId) {
        await activateSession(result.createdSessionId);
        return;
      }
      if (result.status === 'missing_requirements') {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setMode('verify');
        return;
      }
      Alert.alert('Sign up failed', `Unexpected status: ${result.status}`);
    } catch (err: any) {
      console.error('[SignUp error]', JSON.stringify(err));
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message ?? 'Try again.';
      Alert.alert('Sign up failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Verify email ---
  const handleVerify = async () => {
    if (!authLoaded || !signUp) return;
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      console.log('[Verify] status:', result.status);
      if (result.status === 'complete' && result.createdSessionId) {
        await activateSession(result.createdSessionId);
        return;
      }
      Alert.alert('Verification failed', `Unexpected status: ${result.status}`);
    } catch (err: any) {
      console.error('[Verify error]', JSON.stringify(err));
      Alert.alert('Invalid code', err?.errors?.[0]?.longMessage ?? 'Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Forgot password: send reset code ---
  const handleForgotPassword = async () => {
    if (!authLoaded || !signIn || !email) return;
    setLoading(true);
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email.trim().toLowerCase() });
      setCodeSent(true);
    } catch (err: any) {
      Alert.alert('Error', err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  // --- Reset password: verify code + set new password ---
  const handleResetPassword = async () => {
    if (!authLoaded || !signIn) return;
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode,
        password: newPassword,
      });
      if (result.status === 'complete' && result.createdSessionId) {
        await activateSession(result.createdSessionId);
      } else {
        Alert.alert(
          'Password updated',
          'Your password has been changed. Sign in with your new password.',
          [{ text: 'OK', onPress: () => { setMode('signin'); setCodeSent(false); setResetCode(''); setNewPassword(''); } }]
        );
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err?.message;
      Alert.alert('Reset failed', msg || 'Check your code and try again.');
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
            <Text style={[s.title, { fontFamily: SYSTEM }]}>Check your email</Text>
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

  // --- Forgot / Reset password (single screen) ---
  if (mode === 'forgot' || mode === 'reset') {
    return (
      <View style={s.root}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.iconCircle}>
              <Ionicons name="lock-closed-outline" size={32} color="rgba(255,255,255,0.8)" />
            </View>
            <Text style={[s.title, { fontFamily: SYSTEM }]}>Reset password</Text>
            <Text style={s.subtitle}>
              {codeSent ? `Code sent to ${email}` : "Enter your email and we'll send a reset code"}
            </Text>

            {/* Email (always shown, locked after code sent) */}
            <View style={[s.card, { marginBottom: 12 }]}>
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
              <TextInput
                style={[s.input, codeSent && { color: 'rgba(255,255,255,0.40)' }]}
                placeholder="Email"
                placeholderTextColor="rgba(255,255,255,0.28)"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                selectionColor="rgba(255,255,255,0.5)"
                editable={!codeSent}
              />
            </View>

            {/* Send code button (shown before code is sent) */}
            {!codeSent && (
              <TouchableOpacity
                style={[s.primaryBtn, (loading || !email) && { opacity: 0.5 }]}
                onPress={handleForgotPassword}
                disabled={loading || !email}
              >
                {loading
                  ? <ActivityIndicator color="#050B14" />
                  : <Text style={s.primaryBtnText}>Send Reset Code</Text>}
              </TouchableOpacity>
            )}

            {/* Code + new password (shown after code is sent) */}
            {codeSent && (
              <>
                <View style={s.card}>
                  <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
                  <TextInput
                    style={s.input}
                    placeholder="6-digit code"
                    placeholderTextColor="rgba(255,255,255,0.28)"
                    value={resetCode}
                    onChangeText={setResetCode}
                    keyboardType="number-pad"
                    selectionColor="rgba(255,255,255,0.5)"
                    autoFocus
                  />
                  <View style={s.inputDivider} />
                  <View style={s.passwordRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="New password"
                      placeholderTextColor="rgba(255,255,255,0.28)"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      selectionColor="rgba(255,255,255,0.5)"
                    />
                    <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={s.eyeBtn}>
                      <Ionicons
                        name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color="rgba(255,255,255,0.40)"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[s.primaryBtn, (loading || !resetCode || !newPassword) && { opacity: 0.5 }]}
                  onPress={handleResetPassword}
                  disabled={loading || !resetCode || !newPassword}
                >
                  {loading
                    ? <ActivityIndicator color="#050B14" />
                    : <Text style={s.primaryBtnText}>Reset Password</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { setCodeSent(false); setResetCode(''); setNewPassword(''); }}
                  style={s.linkBtn}
                >
                  <Text style={s.linkText}>Resend code</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              onPress={() => { setMode('signin'); setCodeSent(false); setResetCode(''); setNewPassword(''); }}
              style={s.linkBtn}
            >
              <Text style={s.linkText}>← Back to sign in</Text>
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

          {/* Forgot password (sign in only) */}
          {isSignIn && (
            <TouchableOpacity onPress={() => setMode('forgot')} style={s.linkBtn}>
              <Text style={s.linkText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

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
