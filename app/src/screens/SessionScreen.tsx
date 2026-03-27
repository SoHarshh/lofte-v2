import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Pressable,
  ActionSheetIOS, Platform, Modal, KeyboardAvoidingView,
  Dimensions, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { API_BASE } from '../config';
import { SessionState, TranscriptEntry, Exercise } from '../types/index';

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
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [prs, setPRs] = useState<any[]>([]);
  const [aiDebrief, setAiDebrief] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastPerformance, setLastPerformance] = useState<Record<string, any>>({});
  const transcriptRef = useRef<ScrollView>(null);

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
      const { granted, canAskAgain } = await AudioModule.requestRecordingPermissionsAsync();
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
      await audioRecorder.prepareToRecordAsync();
      await audioRecorder.record();
      setIsRecording(true);
    } catch (err: any) {
      Alert.alert('Voice unavailable', err?.message ?? 'Could not start recording. Try again.');
    }
  };

  const stopRecordingAndSubmit = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setIsProcessing(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No audio recorded');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const res = await fetch(`${API_BASE}/api/ai/parse-workout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/m4a' }),
      });
      const data = await res.json();
      if (data.exercises?.length > 0) {
        await addToTranscript('voice', 'Voice log', data.exercises, data.notes);
      } else {
        Alert.alert('Nothing recognised', 'Try again or use text input instead.');
      }
    } catch {
      Alert.alert('Failed to process voice log');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Text submit ---
  const submitText = async () => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput('');
    setShowTextInput(false);
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/parse-workout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.exercises?.length > 0) {
        await addToTranscript('text', text, data.exercises, data.notes);
      } else {
        Alert.alert('Nothing recognised', 'Try describing the exercise differently.');
      }
    } catch {
      Alert.alert('Failed to reach backend');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Camera ---
  const takePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) launchPhoto(true);
          if (idx === 2) launchPhoto(false);
        }
      );
    } else {
      launchPhoto(false);
    }
  };

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
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/parse-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: result.assets[0].base64 }),
      });
      const data = await res.json();
      if (data.exercises?.length > 0) {
        await addToTranscript('camera', 'Photo logged', data.exercises, data.notes);
      } else {
        Alert.alert('No workout data found in photo');
      }
    } catch {
      Alert.alert('Failed to process photo');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Add to transcript (auto-starts session) ---
  const addToTranscript = async (
    method: 'voice' | 'text' | 'camera',
    raw: string,
    exercises: Exercise[],
    notes?: string
  ) => {
    // Auto-start the session on first log
    if (!session.isActive) onStart();

    const entry: TranscriptEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      method,
      raw,
      exercises,
    };

    // Fetch last performance for progressive overload hints
    for (const ex of exercises) {
      const key = ex.name.toLowerCase();
      if (lastPerformance[key] !== undefined) continue;
      try {
        const r = await fetch(`${API_BASE}/api/exercises/last?name=${encodeURIComponent(ex.name)}`);
        const last = await r.json();
        setLastPerformance(prev => ({ ...prev, [key]: last }));
      } catch {
        setLastPerformance(prev => ({ ...prev, [key]: null }));
      }
    }

    onUpdate({
      transcript: [...session.transcript, entry],
      exercises: [...session.exercises, ...exercises],
      notes: notes || session.notes,
    });

    // Scroll transcript to bottom
    setTimeout(() => transcriptRef.current?.scrollToEnd({ animated: true }), 100);
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
    if (session.exercises.length === 0) {
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
      const res = await fetch(`${API_BASE}/api/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: session.startTime || new Date().toISOString(),
          notes: session.notes,
          exercises: session.exercises,
        }),
      });
      const result = await res.json();
      setPRs(result.prs || []);

      // Get AI debrief
      try {
        const debriefRes = await fetch(
          `${API_BASE}/api/workouts/${result.workoutId}/summary`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prs: result.prs || [] }),
          }
        );
        const debrief = await debriefRes.json();
        setAiDebrief(debrief.summary || null);
      } catch { /* non-critical */ }

      setShowReview(true);
    } catch {
      Alert.alert('Failed to save workout');
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
    if (hasSetsReps) return `${ex.sets}×${ex.reps}${hasWeight ? ` @ ${ex.weight} lbs` : ''}`;
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
              <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={s.timerPillTint} />
              <View style={s.pillHighlight} />
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
            {session.exercises.length > 0 && (
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
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={s.entryTint} />
                <View style={s.entryIcon}>
                  <Ionicons name={methodIcon(entry.method)} size={15} color="rgba(255,255,255,0.70)" />
                </View>
                <View style={s.entryBody}>
                  {entry.exercises?.map((ex, i) => (
                    <View key={i} style={i > 0 ? { marginTop: 6 } : {}}>
                      <Text style={s.entryName}>{ex.name}</Text>
                      <Text style={s.entryStats}>{formatExStats(ex)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.entryTime}>
                  {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <TouchableOpacity onPress={() => removeEntry(entry.id)} style={{ paddingLeft: 8 }}>
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.30)" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Text input panel */}
        {showTextInput && (
          <View style={s.textPanel}>
            <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={s.textPanelTint} />
            <View style={s.panelHighlight} />
            <TextInput
              style={s.textInputField}
              placeholder='e.g. "bench 3×10 @ 185"'
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={textInput}
              onChangeText={setTextInput}
              onSubmitEditing={submitText}
              returnKeyType="send"
              autoFocus
              selectionColor="rgba(124,58,237,0.8)"
            />
            <TouchableOpacity
              style={[s.sendBtn, !textInput.trim() && { opacity: 0.4 }]}
              onPress={submitText}
              disabled={!textInput.trim()}
            >
              <Ionicons name="arrow-up" size={18} color="#050B14" />
            </TouchableOpacity>
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
            style={[s.actionBtn, showTextInput && s.actionBtnSelected]}
            onPress={() => setShowTextInput(!showTextInput)}
            activeOpacity={0.75}
          >
            <Ionicons
              name="pencil"
              size={20}
              color={showTextInput ? '#050B14' : 'rgba(255,255,255,0.65)'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Processing overlay */}
      {isProcessing && (
        <View style={s.overlay}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={s.overlayTint} />
          <ActivityIndicator size="large" color="rgba(255,255,255,0.90)" />
          <Text style={s.overlayText}>Processing…</Text>
        </View>
      )}

      {/* Review Modal */}
      <Modal visible={showReview} transparent animationType="slide" onRequestClose={handleDone}>
        <View style={s.modalBg}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={s.sheetTint} />
            {/* Handle */}
            <View style={s.sheetHandle} />
            <View style={s.sheetHighlight} />

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
                  <View style={s.sheetHighlight} />
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
  timerPillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  pillHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.20)',
    zIndex: 1,
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
  entryTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
  entryTime: { fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2, zIndex: 1 },

  // Text input panel
  textPanel: {
    marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden',
  },
  textPanelTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  panelHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.20)',
    zIndex: 1,
  },
  textInputField: {
    flex: 1, fontSize: 15, color: '#fff', paddingVertical: 12,
  },
  sendBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

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
  overlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,11,20,0.75)',
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
  sheetTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,11,20,0.85)',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center', marginBottom: 20,
    zIndex: 1,
  },
  sheetHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    zIndex: 2,
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
