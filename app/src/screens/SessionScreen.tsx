import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, SafeAreaView,
  KeyboardAvoidingView, Platform, Pressable, ActionSheetIOS,
} from 'react-native';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../config';
import { SessionState, TranscriptEntry, Exercise } from '../types';

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
  const [showReview, setShowReview] = useState(false);
  const [parsedResult, setParsedResult] = useState<{ exercises: Exercise[]; notes: string } | null>(null);
  const [lastPerformance, setLastPerformance] = useState<Record<string, any>>({});
  const [aiDebrief, setAiDebrief] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [tick, setTick] = useState(0);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    if (!session.isActive) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [session.isActive]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getElapsed = () => session.startTime
    ? Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000)
    : 0;

  // --- Voice PTT (hold to record) ---
  const startRecording = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { Alert.alert('Microphone permission required'); return; }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert('Voice unavailable', 'Voice recording requires a real device. Use text input on the simulator.');
    }
  };

  const stopRecordingAndSubmit = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setIsProcessing(true);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No audio');
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
        await addToTranscript('voice', '🎙 Voice log', data.exercises, data.notes);
      } else {
        Alert.alert('Nothing recognised', 'Try again or type it instead');
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
        Alert.alert('Nothing recognised', 'Try describing the exercise differently');
      }
    } catch {
      Alert.alert('Failed to reach backend');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Camera ---
  const takePhoto = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Take Photo', 'Choose from Library'],
        cancelButtonIndex: 0,
      },
      (idx) => {
        if (idx === 1) launchPhoto(true);
        if (idx === 2) launchPhoto(false);
      }
    );
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

  // --- Add to transcript ---
  const addToTranscript = async (
    method: 'voice' | 'text' | 'camera',
    raw: string,
    exercises: Exercise[],
    notes?: string
  ) => {
    const entry: TranscriptEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      method,
      raw,
      exercises,
    };
    const allExercises = [...session.exercises, ...exercises];
    for (const ex of exercises) {
      const key = ex.name.toLowerCase();
      if (lastPerformance[key] !== undefined) continue;
      try {
        const res = await fetch(`${API_BASE}/api/exercises/last?name=${encodeURIComponent(ex.name)}`);
        const last = await res.json();
        setLastPerformance(prev => ({ ...prev, [key]: last }));
      } catch {
        setLastPerformance(prev => ({ ...prev, [key]: null }));
      }
    }
    onUpdate({
      transcript: [...session.transcript, entry],
      exercises: allExercises,
      notes: notes || session.notes,
    });
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
      Alert.alert('No exercises logged', 'Log at least one exercise before finishing.');
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: session.startTime,
          notes: session.notes,
          exercises: session.exercises,
        }),
      });
      const result = await res.json();

      try {
        const summary = session.exercises
          .map(e => `${e.name} ${e.sets}×${e.reps}${e.weight ? ` @${e.weight}lbs` : ''}`)
          .join(', ');
        const prsText = result.prs?.map((p: any) => p.exerciseName).join(', ') || 'none';
        const debriefRes = await fetch(`${API_BASE}/api/ai/parse-workout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Give a 3-sentence coaching debrief for this workout: ${summary}. PRs hit: ${prsText}. Be specific and motivating.`,
          }),
        });
        const debrief = await debriefRes.json();
        setAiDebrief(debrief.notes || null);
      } catch { /* non-critical */ }

      const prNote = result.prs?.length
        ? `${result.prs.length} PR${result.prs.length > 1 ? 's' : ''} hit! 🏆`
        : 'Workout saved';
      setParsedResult({ exercises: session.exercises, notes: prNote });
      setShowReview(true);
    } catch {
      Alert.alert('Failed to save workout');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDoneReview = () => {
    setShowReview(false);
    setParsedResult(null);
    setAiDebrief(null);
    onEnd();
  };

  const styles = s(colors);
  const formatExStats = (ex: Exercise) => {
    const hasCardio = ex.distance || ex.duration;
    const hasWeight = ex.weight && ex.weight > 0;
    const hasSetsReps = ex.sets && ex.reps && (ex.sets > 1 || ex.reps > 1);
    if (hasCardio && !hasWeight) {
      if (ex.distance) return `${(ex.distance / 1609).toFixed(1)} mi`;
      if (ex.duration) return `${Math.round(ex.duration / 60)} min`;
    }
    if (hasSetsReps) return `${ex.sets}×${ex.reps}${hasWeight ? ` @ ${ex.weight} lbs` : ''}`;
    if (hasWeight) return `${ex.weight} lbs`;
    return '—';
  };

  const methodIcon = (m: string): keyof typeof Ionicons.glyphMap =>
    ({ voice: 'mic', camera: 'camera', text: 'pencil' }[m] ?? 'pencil') as keyof typeof Ionicons.glyphMap;

  // --- Review ---
  if (showReview && parsedResult) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.reviewContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Text style={styles.reviewTitle}>Session Complete</Text>
          <Text style={styles.reviewSub}>{parsedResult.notes}</Text>

          {aiDebrief && (
            <View style={styles.debriefBox}>
              <Text style={styles.debriefLabel}>LOFTE COACH</Text>
              <Text style={styles.debriefText}>{aiDebrief}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>EXERCISES</Text>
          {parsedResult.exercises.map((ex, i) => (
            <View key={i} style={styles.reviewCard}>
              <Text style={styles.reviewExName}>{ex.name}</Text>
              <Text style={styles.reviewExStats}>{formatExStats(ex)}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.doneBtn} onPress={handleDoneReview}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Pre-session ---
  if (!session.isActive) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.startWrap}>
          <Text style={styles.startTitle}>Ready?</Text>
          <Text style={styles.startSubtitle}>
            Log by voice, text, or photo.{'\n'}AI structures your workout at the end.
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={onStart}>
            <Text style={styles.startBtnText}>Start Session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- Active Session ---
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Timer bar */}
        <View style={styles.timerBar}>
          <View>
            <Text style={styles.timerLabel}>ACTIVE</Text>
            <Text style={styles.timer}>{formatTime(getElapsed())}</Text>
          </View>
          <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
            <Text style={styles.finishBtnText}>Finish</Text>
          </TouchableOpacity>
        </View>

        {/* Transcript */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
          {session.transcript.length === 0 && (
            <View style={styles.emptyTranscript}>
              <Ionicons name="mic-outline" size={48} color={colors.border} />
              <Text style={styles.emptyText}>
                Hold mic to speak, type below,{'\n'}or tap camera for machine display
              </Text>
            </View>
          )}
          {session.transcript.map(entry => (
            <View key={entry.id} style={styles.entry}>
              <Ionicons name={methodIcon(entry.method)} size={18} color={colors.textDim} style={{ marginTop: 1 }} />
              <View style={styles.entryBody}>
                {entry.exercises?.map((ex, i) => {
                  const key = ex.name.toLowerCase();
                  const last = lastPerformance[key];
                  return (
                    <View key={i} style={i > 0 ? { marginTop: 8 } : {}}>
                      <Text style={styles.entryExName}>{ex.name}</Text>
                      <Text style={styles.entryStats}>{formatExStats(ex)}</Text>
                      {last?.weight && (
                        <Text style={styles.entryLast}>
                          Last: {last.sets}×{last.reps} @ {last.weight}lbs
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity onPress={() => removeEntry(entry.id)} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder='e.g. "bench 3×10 @ 135"'
            placeholderTextColor={colors.textDim}
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={submitText}
            returnKeyType="send"
          />
          <TouchableOpacity style={[styles.iconBtn, styles.camBtn]} onPress={takePhoto}>
            <Ionicons name="camera" size={22} color={colors.textDim} />
          </TouchableOpacity>
          <Pressable
            style={[styles.iconBtn, styles.micBtn, isRecording && styles.micBtnActive]}
            onPressIn={startRecording}
            onPressOut={stopRecordingAndSubmit}
          >
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={22} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {isProcessing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.overlayText}>Processing…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = (colors: Record<string, string>) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Pre-session
  startWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  startTitle: { fontSize: 42, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  startSubtitle: { fontSize: 15, color: colors.textDim, textAlign: 'center', lineHeight: 22 },
  startBtn: {
    backgroundColor: colors.accent, borderRadius: 20,
    paddingVertical: 18, paddingHorizontal: 52, marginTop: 8,
  },
  startBtnText: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // Timer
  timerBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  timerLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 2 },
  timer: { fontSize: 38, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  finishBtn: {
    backgroundColor: colors.success, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  finishBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Transcript
  transcriptContent: { padding: 16, gap: 10, flexGrow: 1 },
  emptyTranscript: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  entry: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },
  entryBody: { flex: 1 },
  entryExName: { fontSize: 15, fontWeight: '700', color: colors.text },
  entryStats: { fontSize: 14, color: colors.accent, marginTop: 2, fontWeight: '600' },
  entryLast: { fontSize: 12, color: colors.textDim, marginTop: 3 },

  // Input bar
  inputBar: {
    flexDirection: 'row', gap: 8, padding: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: '#111111',
  },
  textInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  iconBtn: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  camBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  micBtn: { backgroundColor: colors.accent },
  micBtnActive: { backgroundColor: colors.danger },
  iconTxt: { fontSize: 20 },

  // Review
  reviewContent: { padding: 24, gap: 12 },
  reviewTitle: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  reviewSub: { fontSize: 16, color: colors.accent, fontWeight: '700' },
  debriefBox: {
    backgroundColor: colors.accentDim, borderRadius: 16,
    padding: 16, marginVertical: 4,
  },
  debriefLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 1.5, marginBottom: 8 },
  debriefText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textDim,
    letterSpacing: 1.5, marginTop: 8,
  },
  reviewCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  reviewExName: { fontSize: 15, fontWeight: '700', color: colors.text },
  reviewExStats: { fontSize: 14, color: colors.accent, marginTop: 4 },
  doneBtn: {
    backgroundColor: colors.accent, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Processing overlay
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  overlayText: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
