import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Pressable,
  Platform, Modal, KeyboardAvoidingView,
  Dimensions, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/expo';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { API_BASE } from '../config';
import { SessionState, TranscriptEntry, Exercise } from '../types/index';
import { ExercisePicker } from '../components/ExercisePicker';

const SCREEN_H = Dimensions.get('window').height;

interface Props {
  session: SessionState;
  onStart: () => void;
  onEnd: () => void;
  onUpdate: (updates: Partial<SessionState>) => void;
  colors: Record<string, string>;
}

export default function SessionScreen({ session, onStart, onEnd, onUpdate, colors }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualExercise, setManualExercise] = useState('');
  const [manualWeight, setManualWeight] = useState(0);
  const [manualReps, setManualReps] = useState(0);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [prs, setPRs] = useState<any[]>([]);
  const [aiDebrief, setAiDebrief] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastPerformance, setLastPerformance] = useState<Record<string, any>>({});
  const transcriptRef = useRef<ScrollView>(null);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Timer
  useEffect(() => {
    if (!session.isActive) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [session.isActive]);

  const getElapsed = (): number =>
    session.startTime ? Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000) : 0;

  const formatTimer = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // --- Voice PTT ---
  const startRecording = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Microphone Access Required',
          'LOFTE needs microphone access to log workouts by voice. Enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      await audioRecorder.record();
      setIsRecording(true);
    } catch (err: any) {
      Alert.alert('Voice unavailable', err?.message ?? 'Could not start recording. Try again.');
    }
  };

  const stopRecordingAndSubmit = async () => {
    if (!isRecording) return;
    setIsRecording(false); // reset UI immediately — no stuck state

    let uri: string | null = null;
    try {
      await audioRecorder.stop();
      uri = audioRecorder.uri;
    } catch (err: any) {
      Alert.alert('Recording failed', err?.message ?? 'Could not stop recording. Try again.');
      return;
    }

    if (!uri) {
      Alert.alert('Recording failed', 'No audio captured. Try again.');
      return;
    }

    // Auto-start session on first log
    if (!session.isActive) onStart();

    // Add a "Parsing..." placeholder immediately so UI feels responsive
    const entryId = Date.now().toString();
    const placeholder: TranscriptEntry = {
      id: entryId,
      timestamp: Date.now(),
      method: 'voice',
      raw: 'Parsing...',
      pending: true,
      exercises: [],
    };
    onUpdate({ transcript: [...sessionRef.current.transcript, placeholder] });
    setTimeout(() => transcriptRef.current?.scrollToEnd({ animated: true }), 100);

    // Process in background — user can keep recording
    processVoiceEntry(entryId, uri);
  };

  const processVoiceEntry = async (entryId: string, uri: string) => {
    try {
      const file = new File(uri);
      const base64 = await file.base64();
      const token = await getToken();
      const r = await fetch(`${API_BASE}/api/ai/parse-workout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/m4a' }),
      });
      const data = await r.json();

      const current = sessionRef.current;
      if (data.exercises?.length > 0) {
        const resolved: TranscriptEntry = {
          id: entryId,
          timestamp: Date.now(),
          method: 'voice',
          raw: data.transcript || 'Voice log',
          pending: false,
          exercises: data.exercises,
        };
        onUpdate({
          transcript: current.transcript.map(e => e.id === entryId ? resolved : e),
          exercises: [...current.exercises, ...data.exercises],
        });
      } else {
        // Nothing recognised — remove the placeholder
        onUpdate({ transcript: current.transcript.filter(e => e.id !== entryId) });
        Alert.alert('Nothing recognised', 'Try speaking more clearly, or use manual entry.');
      }
    } catch (err: any) {
      const current = sessionRef.current;
      onUpdate({ transcript: current.transcript.filter(e => e.id !== entryId) });
      Alert.alert('Voice log failed', err?.message ?? 'Could not process recording. Try again.');
    }
  };

  // --- Manual entry (structured form) ---
  const logManualSet = () => {
    if (!manualExercise.trim()) {
      Alert.alert('Enter an exercise name');
      return;
    }
    const exercise: Exercise = {
      name: manualExercise.trim(),
      muscleGroup: '',
      sets: 1,
      reps: manualReps || 0,
      weight: manualWeight || 0,
    };

    if (editingEntryId) {
      // Update existing entry
      const updated = session.transcript.map(e =>
        e.id === editingEntryId ? { ...e, exercises: [exercise] } : e
      );
      const updatedExercises = updated.flatMap(e => e.exercises ?? []);
      onUpdate({ transcript: updated, exercises: updatedExercises });
      setEditingEntryId(null);
      setShowManualEntry(false);
    } else {
      addToTranscript('text', exercise.name, [exercise]);
      setManualReps(0);
    }
  };

  const startEditEntry = (entryId: string) => {
    const entry = session.transcript.find(e => e.id === entryId);
    if (!entry?.exercises?.[0]) return;
    const ex = entry.exercises[0];
    setManualExercise(ex.name);
    setManualWeight(ex.weight ?? 0);
    setManualReps(ex.reps ?? 0);
    setEditingEntryId(entryId);
    setShowManualEntry(true);
  };

  const cancelEdit = () => {
    setEditingEntryId(null);
    setManualExercise('');
    setManualWeight(0);
    setManualReps(0);
    setShowManualEntry(false);
  };

  // --- Camera ---
  const takePhoto = () => launchPhoto(true);

  const launchPhoto = async (useCamera: boolean) => {
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) { Alert.alert('Camera permission required'); return; }
      try {
        result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      } catch {
        Alert.alert('Camera unavailable', 'Use "Choose from Library" on the simulator.');
        return;
      }
    } else {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { Alert.alert('Photo library permission required'); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        base64: true, quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
    }
    if (result.canceled || !result.assets?.[0]?.base64) return;
    if (!session.isActive) onStart();

    const entryId = Date.now().toString();
    const placeholder: TranscriptEntry = {
      id: entryId,
      timestamp: Date.now(),
      method: 'camera',
      raw: 'Parsing photo...',
      pending: true,
      exercises: [],
    };
    onUpdate({ transcript: [...sessionRef.current.transcript, placeholder] });
    setTimeout(() => transcriptRef.current?.scrollToEnd({ animated: true }), 100);

    processImageEntry(entryId, result.assets[0].base64!);
  };

  const processImageEntry = async (entryId: string, base64: string) => {
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/api/ai/parse-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await r.json();
      const current = sessionRef.current;

      if (data.exercises?.length > 0) {
        const resolved: TranscriptEntry = {
          id: entryId,
          timestamp: Date.now(),
          method: 'camera',
          raw: 'Photo log',
          pending: false,
          exercises: data.exercises,
        };
        onUpdate({
          transcript: current.transcript.map(e => e.id === entryId ? resolved : e),
          exercises: [...current.exercises, ...data.exercises],
        });
      } else {
        onUpdate({ transcript: current.transcript.filter(e => e.id !== entryId) });
        Alert.alert('Nothing recognised', 'Could not read exercises from the photo.');
      }
    } catch (err: any) {
      const current = sessionRef.current;
      onUpdate({ transcript: current.transcript.filter(e => e.id !== entryId) });
      Alert.alert('Photo log failed', err?.message ?? 'Try again.');
    }
  };

  // --- Add to transcript (instant — no awaiting) ---
  const addToTranscript = (
    method: 'voice' | 'text' | 'camera',
    raw: string,
    exercises: Exercise[],
    notes?: string
  ) => {
    if (!session.isActive) onStart();

    const entry: TranscriptEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      method,
      raw,
      exercises,
    };

    const current = sessionRef.current;
    onUpdate({
      transcript: [...current.transcript, entry],
      exercises: [...current.exercises, ...exercises],
      notes: notes || current.notes,
    });

    setTimeout(() => transcriptRef.current?.scrollToEnd({ animated: true }), 100);

    // Fetch overload hints in background — never blocks the UI
    for (const ex of exercises) {
      const key = ex.name.toLowerCase();
      if (lastPerformance[key] !== undefined) continue;
      getToken().then(token => {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch(`${API_BASE}/api/exercises/last?name=${encodeURIComponent(ex.name)}`, { headers });
      })
        .then(r => r.json())
        .then(last => setLastPerformance(prev => ({ ...prev, [key]: last })))
        .catch(() => setLastPerformance(prev => ({ ...prev, [key]: null })));
    }
  };

  const removeEntry = (id: string) => {
    const entry = session.transcript.find(e => e.id === id);
    if (!entry) return;
    const removedNames = new Set(entry.exercises?.map(e => e.name) ?? []);
    onUpdate({
      transcript: session.transcript.filter(e => e.id !== id),
      exercises: session.exercises.filter(ex => !removedNames.has(ex.name)),
    });
  };

  // --- Finish ---
  const handleFinish = async () => {
    const stillParsing = session.transcript.some(e => e.pending);
    const hasExercises = session.exercises.length > 0;

    if (stillParsing) {
      Alert.alert('Still processing', 'A voice or photo log is still being parsed. Wait a moment and try again.');
      return;
    }

    if (!hasExercises) {
      Alert.alert(
        'Discard session?',
        'No exercises logged.',
        [
          { text: 'Keep Going', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => { onEnd(); navigation.navigate('Home' as never); } },
        ]
      );
      return;
    }

    setIsProcessing(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/workouts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          date: session.startTime || new Date().toISOString(),
          notes: session.notes,
          exercises: session.exercises,
        }),
      });
      const result = await res.json();
      setPRs(result.prs || []);

      // AI debrief (non-critical)
      try {
        const debriefRes = await fetch(`${API_BASE}/api/workouts/${result.workoutId}/summary`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ prs: result.prs || [] }),
        });
        const debrief = await debriefRes.json();
        setAiDebrief(debrief.summary || null);
      } catch { /* non-critical */ }

      setShowReview(true);
    } catch (err: any) {
      Alert.alert('Failed to save workout', err?.message ?? 'Try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = () => {
    setShowReview(false);
    setPRs([]);
    setAiDebrief(null);
    onEnd();
    navigation.navigate('Home' as never);
  };

  const formatExStats = (ex: Exercise): string => {
    const hasCardio = ex.distance || ex.duration;
    const hasWeight = ex.weight && ex.weight > 0;
    const hasSetsReps = ex.sets && ex.reps && (ex.sets > 1 || ex.reps > 1);
    if (hasCardio && !hasWeight) {
      const parts: string[] = [];
      if (ex.distance) parts.push(`${(ex.distance / 1609).toFixed(1)} mi`);
      if (ex.duration) parts.push(`${Math.round(ex.duration / 60)} min`);
      if (ex.pace) parts.push(ex.pace);
      return parts.join(' · ') || '—';
    }
    if (hasSetsReps) {
      const setsStr = (ex.sets ?? 1) > 1 ? `${ex.sets}×` : '';
      return `${setsStr}${ex.reps} reps${hasWeight ? ` @ ${ex.weight} lbs` : ''}`;
    }
    if (hasWeight) return `${ex.weight} lbs`;
    return '—';
  };

  const methodIcon = (m: string): keyof typeof Ionicons.glyphMap =>
    m === 'voice' ? 'mic' : m === 'camera' ? 'camera' : 'pencil';

  const overloadHint = (() => {
    for (const entry of [...session.transcript].reverse()) {
      for (const ex of entry.exercises ?? []) {
        const last = lastPerformance[ex.name.toLowerCase()];
        if (last?.weight) return `Last ${ex.name}: ${last.sets}×${last.reps} @ ${last.weight} lbs`;
      }
    }
    return null;
  })();

  const elapsed = getElapsed();

  return (
    <View style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          {/* Back button — always visible */}
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => {
              if (session.exercises.length > 0) {
                Alert.alert(
                  'Discard session?',
                  'You have exercises logged. Are you sure you want to leave?',
                  [
                    { text: 'Keep Going', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: () => { onEnd(); navigation.navigate('Home' as never); } },
                  ]
                );
              } else {
                Alert.alert(
                  'Leave session?',
                  'Nothing has been logged yet.',
                  [
                    { text: 'Stay', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => { onEnd(); navigation.navigate('Home' as never); } },
                  ]
                );
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            {/* Timer pill */}
            <View style={s.timerPill}>
              <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
              <Text style={s.timerText}>
                {session.isActive ? formatTimer(elapsed) : '—'}
              </Text>
            </View>
            {/* Status label */}
            <View style={s.statusRow}>
              {session.isActive && <View style={s.activeDot} />}
              <Text style={s.statusLabel}>
                {session.isActive ? 'Session Active' : 'Ready to log'}
              </Text>
            </View>
          </View>

          {/* Right: Finish (when exercises logged) */}
          <View style={{ width: 80, alignItems: 'flex-end' }}>
            {(session.exercises.length > 0 || session.transcript.some(e => e.pending)) && (
              <TouchableOpacity style={s.finishPill} onPress={handleFinish} activeOpacity={0.8}>
                <Text style={s.finishPillText}>Finish</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Progressive overload hint */}
        {overloadHint && (
          <View style={s.hintBanner}>
            <Text style={s.hintText} numberOfLines={1}>{overloadHint}</Text>
          </View>
        )}

        {/* Voice UI area */}
        <View style={s.voiceArea}>
          <Text style={s.voicePrompt}>
            {isRecording ? 'Listening...' : 'Hold mic to log your sets'}
          </Text>
          <View style={s.micWrap}>
            {/* Sonar rings */}
            {isRecording && (
              <>
                <View style={[s.sonarRing, { width: 160, height: 160, borderRadius: 80, opacity: 0.15 }]} />
                <View style={[s.sonarRing, { width: 200, height: 200, borderRadius: 100, opacity: 0.08 }]} />
              </>
            )}
            <Pressable
              style={[s.micBtn, isRecording && s.micBtnRecording]}
              onPressIn={startRecording}
              onPressOut={stopRecordingAndSubmit}
            >
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={36}
                color={isRecording ? '#050B14' : '#fff'}
              />
            </Pressable>
          </View>
        </View>

        {/* Transcript scroll */}
        {session.transcript.length > 0 && (
          <ScrollView
            ref={transcriptRef}
            style={s.transcriptScroll}
            contentContainerStyle={s.transcriptContent}
            showsVerticalScrollIndicator={false}
          >
            {session.transcript.map(entry => (
              <View key={entry.id} style={s.entry}>
                <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={s.entryIcon}>
                  <Ionicons name={methodIcon(entry.method)} size={15} color="rgba(255,255,255,0.70)" />
                </View>
                <View style={s.entryBody}>
                  {entry.pending ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="rgba(255,255,255,0.50)" />
                      <Text style={s.entryPending}>{entry.raw}</Text>
                    </View>
                  ) : (
                    entry.exercises?.map((ex, i) => (
                      <View key={i} style={i > 0 ? { marginTop: 6 } : {}}>
                        <Text style={s.entryName}>{ex.name}</Text>
                        <Text style={s.entryStats}>{formatExStats(ex)}</Text>
                      </View>
                    ))
                  )}
                </View>
                <Text style={s.entryTime}>
                  {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                {!entry.pending && (
                  <TouchableOpacity onPress={() => startEditEntry(entry.id)} style={{ paddingLeft: 8 }}>
                    <Ionicons name="pencil-outline" size={15} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => removeEntry(entry.id)} style={{ paddingLeft: 8 }}>
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.30)" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Manual entry panel */}
        {showManualEntry && (
          <View style={s.manualPanel}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />

            {/* Exercise name — tap to open picker */}
            <TouchableOpacity
              style={s.exercisePickerBtn}
              onPress={() => setShowExercisePicker(true)}
              activeOpacity={0.75}
            >
              <Text style={[s.exercisePickerText, !manualExercise && s.exercisePickerPlaceholder]}>
                {manualExercise || 'Select exercise...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
            <View style={s.manualDivider} />

            {/* Weight + Reps */}
            <View style={s.manualFieldsRow}>
              {/* Weight */}
              <View style={s.manualField}>
                <Text style={s.manualFieldLabel}>WEIGHT</Text>
                <View style={s.stepperBox}>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setManualWeight(w => Math.max(0, w - 5))}
                  >
                    <Ionicons name="remove" size={16} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                  <TextInput
                    style={s.stepperValue}
                    value={manualWeight === 0 ? '' : String(manualWeight)}
                    onChangeText={v => setManualWeight(Number(v.replace(/[^0-9]/g, '')) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setManualWeight(w => w + 5)}
                  >
                    <Ionicons name="add" size={16} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.manualFieldDivider} />

              {/* Reps */}
              <View style={s.manualField}>
                <Text style={s.manualFieldLabel}>REPS</Text>
                <View style={s.stepperBox}>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setManualReps(r => Math.max(0, r - 1))}
                  >
                    <Ionicons name="remove" size={16} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                  <TextInput
                    style={s.stepperValue}
                    value={manualReps === 0 ? '' : String(manualReps)}
                    onChangeText={v => setManualReps(Number(v.replace(/[^0-9]/g, '')) || 0)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    selectionColor="rgba(255,255,255,0.5)"
                  />
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setManualReps(r => r + 1)}
                  >
                    <Ionicons name="add" size={16} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Log Set / Update button */}
            <TouchableOpacity
              style={[s.logSetBtn, !manualExercise.trim() && { opacity: 0.4 }]}
              onPress={logManualSet}
              activeOpacity={0.85}
            >
              <Text style={s.logSetBtnText}>{editingEntryId ? 'Update Set' : 'Log Set'}</Text>
            </TouchableOpacity>
            {editingEntryId && (
              <TouchableOpacity onPress={cancelEdit} style={s.cancelEditBtn}>
                <Text style={s.cancelEditText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Action cluster */}
        <View style={[s.actionCluster, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={s.actionBtn} onPress={takePhoto} activeOpacity={0.75}>
            <Ionicons name="camera" size={22} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>

          {/* Center mic (duplicated for action bar) */}
          <Pressable
            style={[s.actionBtnLarge, isRecording && s.actionBtnLargeActive]}
            onPressIn={startRecording}
            onPressOut={stopRecordingAndSubmit}
          >
            <Ionicons
              name={isRecording ? 'stop' : 'mic'}
              size={24}
              color={isRecording ? '#050B14' : '#fff'}
            />
          </Pressable>

          <TouchableOpacity
            style={[s.actionBtn, showManualEntry && s.actionBtnSelected]}
            onPress={() => setShowManualEntry(!showManualEntry)}
            activeOpacity={0.75}
          >
            <Ionicons
              name="pencil"
              size={20}
              color={showManualEntry ? '#050B14' : 'rgba(255,255,255,0.65)'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Exercise picker */}
      <ExercisePicker
        visible={showExercisePicker}
        onSelect={name => setManualExercise(name)}
        onClose={() => setShowExercisePicker(false)}
      />

      {/* Processing overlay */}
      {isProcessing && (
        <View style={s.overlay}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <ActivityIndicator size="large" color="rgba(255,255,255,0.90)" />
          <Text style={s.overlayText}>Processing…</Text>
        </View>
      )}

      {/* Review Modal */}
      <Modal visible={showReview} transparent animationType="slide" onRequestClose={handleDone}>
        <View style={s.modalBg}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            {/* Handle */}
            <View style={s.sheetHandle} />

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, zIndex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={s.reviewTitle}>Session Complete</Text>
              <Text style={s.reviewSub}>
                {session.startTime
                  ? new Date(session.startTime).toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })
                  : 'Today'}
              </Text>

              {/* PR banners */}
              {prs.length > 0 && prs.map((pr, i) => (
                <View key={i} style={s.prBanner}>
                  <View style={s.prIcon}>
                    <Ionicons name="trophy" size={18} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={s.prTitle}>New PR — {pr.exerciseName} {pr.weight} lbs</Text>
                    {pr.previous && (
                      <Text style={s.prPrev}>Previous best: {pr.previous} lbs</Text>
                    )}
                  </View>
                </View>
              ))}

              {/* Exercise list */}
              <View style={s.reviewExList}>
                {session.exercises.map((ex, i) => (
                  <View key={i} style={s.reviewExRow}>
                    <Text style={s.reviewExName}>{ex.name}</Text>
                    <Text style={s.reviewExStats}>{formatExStats(ex)}</Text>
                  </View>
                ))}
              </View>

              {/* AI Debrief */}
              {aiDebrief && (
                <View style={s.debriefCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <Text style={s.debriefLabel}>LOFTE COACH</Text>
                    <Ionicons name="flash" size={10} color="rgba(255,255,255,0.65)" />
                  </View>
                  <Text style={s.debriefText}>{aiDebrief}</Text>
                </View>
              )}
            </ScrollView>

            {/* Action buttons */}
            <TouchableOpacity style={s.saveBtn} onPress={handleDone} activeOpacity={0.85}>
              <Text style={s.saveBtnText}>Save Session</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.discardBtn}
              onPress={() => { setShowReview(false); onEnd(); navigation.navigate('Home' as never); }}
            >
              <Text style={s.discardBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  timerPill: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 100,
    paddingHorizontal: 20, paddingVertical: 8,
    overflow: 'hidden',
  },
  timerText: {
    fontFamily: 'Courier', fontSize: 22, fontWeight: '500',
    color: '#fff', letterSpacing: 2, zIndex: 1,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  activeDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444',
  },
  statusLabel: { fontSize: 10, color: 'rgba(255,255,255,0.50)', letterSpacing: 1.5, textTransform: 'uppercase' },
  finishPill: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8,
  },
  finishPillText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Overload hint
  hintBanner: {
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
  },
  hintText: { fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: '500' },

  // Voice area
  voiceArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 16 },
  voicePrompt: {
    fontSize: 17, color: 'rgba(255,255,255,0.40)',
    marginBottom: 32, textAlign: 'center',
  },
  micWrap: { alignItems: 'center', justifyContent: 'center' },
  sonarRing: {
    position: 'absolute',
    borderWidth: 1, borderColor: '#fff',
  },
  micBtn: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnRecording: {
    backgroundColor: '#fff',
    borderColor: 'transparent',
  },

  // Transcript
  transcriptScroll: {
    maxHeight: SCREEN_H * 0.30,
    marginHorizontal: 16,
  },
  transcriptContent: { paddingVertical: 4 },
  entry: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16, padding: 14, marginBottom: 8, gap: 10,
    overflow: 'hidden',
  },
  entryIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  entryBody: { flex: 1, zIndex: 1 },
  entryName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  entryStats: { fontSize: 13, color: 'rgba(255,255,255,0.60)', marginTop: 2 },
  entryPending: { fontSize: 13, color: 'rgba(255,255,255,0.40)', fontStyle: 'italic' },
  entryTime: { fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2, zIndex: 1 },

  // Manual entry panel
  manualPanel: {
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24, overflow: 'hidden',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
  },
  exercisePickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12, zIndex: 1,
  },
  exercisePickerText: {
    fontSize: 22, fontWeight: '500', color: '#fff', flex: 1,
  },
  exercisePickerPlaceholder: {
    color: 'rgba(255,255,255,0.28)',
  },
  manualDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 16,
  },
  manualFieldsRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 16, zIndex: 1,
  },
  manualField: { flex: 1, alignItems: 'center' },
  manualFieldLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.40)',
    letterSpacing: 1.5, marginBottom: 10,
  },
  manualFieldDivider: {
    width: 1, height: 56, backgroundColor: 'rgba(255,255,255,0.10)',
  },
  stepperBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  stepperBtn: {
    width: 40, height: 48, alignItems: 'center', justifyContent: 'center',
  },
  stepperValue: {
    flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '600',
    color: '#fff', paddingVertical: 0,
  },
  logSetBtn: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center', zIndex: 1,
  },
  logSetBtnText: { fontSize: 16, fontWeight: '700', color: '#050B14' },
  cancelEditBtn: { paddingVertical: 10, alignItems: 'center', zIndex: 1 },
  cancelEditText: { fontSize: 14, color: 'rgba(255,255,255,0.38)', fontWeight: '500' },

  // Action cluster
  actionCluster: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 20, paddingTop: 8,
    paddingHorizontal: 32,
  },
  actionBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnSelected: { backgroundColor: '#fff', borderColor: 'transparent' },
  actionBtnLarge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnLargeActive: { backgroundColor: '#fff', borderColor: 'transparent' },

  // Overlay
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 12,
    overflow: 'hidden',
  },
  overlayText: { color: 'rgba(255,255,255,0.80)', fontSize: 15, fontWeight: '500', zIndex: 1 },

  // Review Modal
  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.50)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 24, maxHeight: '92%',
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center', marginBottom: 20,
    zIndex: 1,
  },
  reviewTitle: { fontSize: 28, fontWeight: '400', color: '#fff', fontFamily: 'Georgia', marginBottom: 4 },
  reviewSub: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20 },

  prBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)',
    borderRadius: 18, padding: 14, marginBottom: 12,
  },
  prIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(245,158,11,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  prTitle: { fontSize: 14, fontWeight: '600', color: '#F59E0B', marginBottom: 2 },
  prPrev: { fontSize: 11, color: 'rgba(245,158,11,0.60)' },

  reviewExList: { gap: 12, marginBottom: 16 },
  reviewExRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reviewExName: { fontSize: 15, fontWeight: '500', color: '#fff' },
  reviewExStats: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },

  debriefCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20, padding: 16, marginBottom: 16, overflow: 'hidden',
  },
  debriefLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  debriefText: { fontSize: 14, color: 'rgba(255,255,255,0.80)', lineHeight: 22 },

  saveBtn: {
    backgroundColor: '#fff', borderRadius: 18,
    paddingVertical: 16, alignItems: 'center', marginBottom: 8,
    zIndex: 1,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#050B14' },
  discardBtn: { paddingVertical: 12, alignItems: 'center', zIndex: 1 },
  discardBtnText: { fontSize: 15, color: 'rgba(255,255,255,0.38)', fontWeight: '500' },
});
