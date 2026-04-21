import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Platform, Image, Switch,
  Modal, Alert, ActionSheetIOS, Pressable,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useUser, useAuth } from '@clerk/expo';
import { GlassCard } from '../components/GlassCard';
import { API_BASE } from '../config';
import { Workout } from '../types/index';
import { useAuthFetch } from '../hooks/useAuthFetch';
import {
  isHealthAvailable, isHealthConnected, setHealthConnected,
  requestHealthPermissions,
} from '../utils/health';

import { FONT_SEMIBOLD } from '../utils/fonts';
const SYSTEM = FONT_SEMIBOLD;

interface Props { colors: Record<string, string>; }

function sessionVolume(w: Workout): number {
  return w.exercises.reduce((a, e) =>
    a + ((e.sets || 0) * (e.reps || 0) * (e.weight || 0)), 0);
}

function calcStreak(workouts: Workout[]): number {
  if (!workouts.length) return 0;
  const days = new Set(workouts.map(w => w.date.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function formatVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${Math.round(v)}`;
}

export default function ProfileScreen({ colors }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [useKg, setUseKg] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [healthOn, setHealthOn] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useAuth();
  const authFetch = useAuthFetch();

  useEffect(() => {
    SecureStore.getItemAsync('units_kg').then(v => { if (v === 'true') setUseKg(true); });
    isHealthConnected().then(setHealthOn);
  }, []);

  const toggleUnits = (val: boolean) => {
    setUseKg(val);
    SecureStore.setItemAsync('units_kg', String(val));
  };

  const toggleHealth = async (val: boolean) => {
    if (healthBusy) return;
    if (!isHealthAvailable()) {
      Alert.alert('Unavailable', 'Apple Health is only supported on iOS devices.');
      return;
    }
    setHealthBusy(true);
    try {
      if (val) {
        const granted = await requestHealthPermissions();
        if (granted) {
          setHealthOn(true);
        } else {
          Alert.alert(
            'Permission needed',
            'Enable Apple Health access in Settings → Privacy → Health → LOFTE to connect.'
          );
          setHealthOn(false);
        }
      } else {
        await setHealthConnected(false);
        setHealthOn(false);
      }
    } finally {
      setHealthBusy(false);
    }
  };

  const displayName = user?.fullName || user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Athlete';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarUrl = user?.imageUrl;

  // Avatar picker: choose a source, pick/capture, upload to Clerk.
  // Clerk stores the image on the user record, so it persists across sessions
  // and any re-auth. `user.imageUrl` auto-updates after setProfileImage resolves.
  const uploadAvatar = async (useCamera: boolean) => {
    if (avatarUploading || !user) return;
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        useCamera ? 'Camera access needed' : 'Photos access needed',
        'Enable it in Settings to change your profile photo.'
      );
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          quality: 0.7, base64: true, allowsEditing: true, aspect: [1, 1],
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7, base64: true, allowsEditing: true, aspect: [1, 1],
        });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setAvatarUploading(true);
    try {
      const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
      await user.setProfileImage({ file: dataUrl });
      // Clerk's useUser auto-refreshes after setProfileImage resolves.
    } catch (err: any) {
      Alert.alert('Upload failed', err?.errors?.[0]?.longMessage ?? err?.message ?? 'Could not update photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (avatarUploading || !user) return;
    setAvatarUploading(true);
    try {
      await user.setProfileImage({ file: null });
    } catch (err: any) {
      Alert.alert('Failed', err?.message ?? 'Could not remove photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const openAvatarSheet = () => {
    if (avatarUploading) return;
    const hasAvatar = !!avatarUrl;
    if (Platform.OS === 'ios') {
      const options = ['Cancel', 'Take Photo', 'Choose from Library'];
      if (hasAvatar) options.push('Remove Photo');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: hasAvatar ? 3 : undefined,
        },
        (idx) => {
          if (idx === 1) uploadAvatar(true);
          else if (idx === 2) uploadAvatar(false);
          else if (idx === 3 && hasAvatar) removeAvatar();
        }
      );
    } else {
      const buttons: any[] = [
        { text: 'Take Photo', onPress: () => uploadAvatar(true) },
        { text: 'Choose from Library', onPress: () => uploadAvatar(false) },
      ];
      if (hasAvatar) buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: removeAvatar });
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Profile photo', undefined, buttons);
    }
  };

  const load = useCallback(() => {
    authFetch(`${API_BASE}/api/workouts`)
      .then(r => r.json())
      .then(data => { setWorkouts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authFetch]);

  useFocusEffect(load);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await authFetch(`${API_BASE}/api/account`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');
      setDeleteModalVisible(false);
      // Small delay so modal dismisses before sign-out clears the screen
      setTimeout(() => signOut(), 300);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const TAB_BAR_H = 80 + Math.max(insets.bottom, 8);

  const totalSessions = workouts.length;
  const totalVolume = workouts.reduce((a, w) => a + sessionVolume(w), 0);
  const streak = calcStreak(workouts);

  // Count unique exercise PRs (highest weight ever per exercise)
  const prCount = (() => {
    const bests: Record<string, number> = {};
    [...workouts].reverse().forEach(w =>
      w.exercises.forEach(e => {
        if (!e.weight) return;
        const key = e.name.toLowerCase();
        if (!bests[key] || e.weight > bests[key]) bests[key] = e.weight;
      })
    );
    return Object.keys(bests).length;
  })();

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="rgba(255,255,255,0.55)" size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 24, paddingBottom: TAB_BAR_H + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + identity */}
        <View style={s.hero}>
          <Pressable
            onPress={openAvatarSheet}
            style={({ pressed }) => [s.avatarWrap, pressed && { opacity: 0.85 }]}
            hitSlop={6}
          >
            <View style={s.avatarHighlight} />
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFillObject} />
              : <Text style={[s.avatarInitials, { fontFamily: SYSTEM }]}>{initials}</Text>
            }
            {/* Camera overlay badge — indicates tap-to-change */}
            {!avatarUploading && (
              <View style={s.avatarBadge}>
                <Ionicons name="camera" size={12} color="#050B14" />
              </View>
            )}
            {avatarUploading && (
              <View style={s.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </Pressable>
          <Text style={[s.name, { fontFamily: SYSTEM }]}>{displayName}</Text>
          <Text style={s.memberLabel}>LOFTE MEMBER</Text>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <StatCard value={String(totalSessions)} label="Sessions" icon="barbell-outline" />
          <StatCard value={formatVol(totalVolume)} label="Total Volume" icon="trending-up-outline" />
          <StatCard value={String(streak)} label="Day Streak" icon="flame-outline" />
          <StatCard value={String(prCount)} label="PRs Set" icon="trophy-outline" />
        </View>

        {/* Units */}
        <Text style={s.sectionTitle}>Preferences</Text>
        <GlassCard padding={0} style={s.settingsCard}>
          <View style={s.settingsRow}>
            <View style={s.settingsIconWrap}>
              <Ionicons name="scale-outline" size={18} color="rgba(255,255,255,0.55)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingsLabel}>Weight Unit</Text>
              <Text style={s.settingsSubLabel}>{useKg ? 'Kilograms (kg)' : 'Pounds (lbs)'}</Text>
            </View>
            <Switch
              value={useKg}
              onValueChange={toggleUnits}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(255,255,255,0.40)' }}
              thumbColor="#fff"
            />
          </View>
        </GlassCard>

        {/* Connected Devices */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>Connected Devices</Text>
        <GlassCard padding={0} style={s.settingsCard}>
          {/* Apple Health — active */}
          <View style={[s.settingsRow, s.settingsRowBorder]}>
            <View style={s.settingsIconWrap}>
              <Ionicons name="heart-outline" size={18} color={healthOn ? '#10B981' : 'rgba(255,255,255,0.55)'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingsLabel}>Apple Health</Text>
              <Text style={s.settingsSubLabel}>
                {!isHealthAvailable()
                  ? 'iOS only'
                  : healthOn
                    ? 'Connected · syncing biometrics'
                    : 'Sync steps, sleep, heart rate & HRV'}
              </Text>
            </View>
            {healthBusy ? (
              <ActivityIndicator color="rgba(255,255,255,0.70)" />
            ) : (
              <Switch
                value={healthOn}
                onValueChange={toggleHealth}
                disabled={!isHealthAvailable()}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(16,185,129,0.55)' }}
                thumbColor="#fff"
              />
            )}
          </View>
          {/* Whoop — coming soon */}
          <View style={s.settingsRow}>
            <View style={s.settingsIconWrap}>
              <Ionicons name="watch-outline" size={18} color="rgba(255,255,255,0.35)" />
            </View>
            <Text style={[s.settingsLabel, { color: 'rgba(255,255,255,0.45)', flex: 1 }]}>Whoop</Text>
            <View style={s.comingSoonBadge}>
              <Text style={s.comingSoonText}>Soon</Text>
            </View>
          </View>
        </GlassCard>

        {/* Account */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>Account</Text>
        <GlassCard padding={0} style={s.settingsCard}>
          <TouchableOpacity
            style={s.settingsRow}
            onPress={() => signOut()}
            activeOpacity={0.7}
          >
            <View style={s.settingsIconWrap}>
              <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.55)" />
            </View>
            <Text style={[s.settingsLabel, { flex: 1 }]}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>
          <View style={s.settingsRowBorder} />
          <TouchableOpacity
            style={s.settingsRow}
            onPress={() => setDeleteModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[s.settingsIconWrap, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.25)' }]}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </View>
            <Text style={[s.settingsLabel, { color: '#EF4444', flex: 1 }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(239,68,68,0.40)" />
          </TouchableOpacity>
        </GlassCard>

        {/* App version */}
        <Text style={s.version}>LOFTE v1.0 · Built for athletes</Text>
      </ScrollView>

      {/* Delete Account Confirmation */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteModalVisible(false)}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => !deleting && setDeleteModalVisible(false)}
        >
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </TouchableOpacity>

        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />

            <Text style={[s.dialogTitle, { fontFamily: SYSTEM }]}>Are you sure?</Text>
            <Text style={s.dialogMessage}>
              This will permanently delete your account, workout history, and all associated data. This cannot be undone.
            </Text>

            <View style={s.dialogDivider} />

            <TouchableOpacity
              style={s.dialogBtnDelete}
              onPress={handleDeleteAccount}
              disabled={deleting}
              activeOpacity={0.7}
            >
              {deleting ? (
                <ActivityIndicator color="#EF4444" size="small" />
              ) : (
                <Text style={s.dialogBtnDeleteText}>Delete Account</Text>
              )}
            </TouchableOpacity>

            <View style={s.dialogDivider} />

            <TouchableOpacity
              style={s.dialogBtnCancel}
              onPress={() => setDeleteModalVisible(false)}
              disabled={deleting}
              activeOpacity={0.7}
            >
              <Text style={s.dialogBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ value, label, icon }: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <GlassCard style={s.statCard} padding={16}>
      <Ionicons name={icon} size={16} color="rgba(255,255,255,0.40)" style={{ marginBottom: 8 }} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </GlassCard>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20 },

  hero: { alignItems: 'center', marginBottom: 32 },
  avatarWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, overflow: 'hidden',
  },
  avatarHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  avatarInitials: { fontSize: 34, fontWeight: '400', color: '#fff' },
  avatarBadge: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#050B14',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,11,20,0.55)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  name: { fontSize: 26, fontWeight: '400', color: '#fff', marginBottom: 6 },
  memberLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2, textTransform: 'uppercase',
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, marginBottom: 28,
  },
  statCard: { width: '47%' },
  statValue: { fontSize: 24, fontWeight: '300', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.40)', letterSpacing: 0.3 },

  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  },

  settingsCard: { borderRadius: 20, overflow: 'hidden' },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  settingsRowBorder: {
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  settingsIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.80)' },
  settingsSubLabel: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  comingSoonBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  comingSoonText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.40)', letterSpacing: 1 },

  version: {
    textAlign: 'center', fontSize: 11,
    color: 'rgba(255,255,255,0.20)', marginTop: 20,
    letterSpacing: 0.5,
  },

  // Delete account dialog
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  dialogWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40,
  },
  dialog: {
    width: '100%', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  dialogTitle: {
    fontSize: 20, fontWeight: '500', color: '#fff',
    textAlign: 'center', paddingTop: 24, paddingHorizontal: 24,
    paddingBottom: 8, zIndex: 1,
  },
  dialogMessage: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)',
    textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 24, paddingBottom: 20, zIndex: 1,
  },
  dialogDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dialogBtnDelete: {
    paddingVertical: 16, alignItems: 'center', zIndex: 1,
  },
  dialogBtnDeleteText: {
    fontSize: 17, fontWeight: '600', color: '#EF4444',
  },
  dialogBtnCancel: {
    paddingVertical: 16, alignItems: 'center', zIndex: 1,
  },
  dialogBtnCancelText: {
    fontSize: 17, fontWeight: '400', color: 'rgba(255,255,255,0.70)',
  },
});
