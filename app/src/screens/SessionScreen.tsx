import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, SafeAreaView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
  const [tick, setTick] = useState(0);

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

  // --- Text submit ---
  const submitText = async () => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput('');
    setIsProcessing(true);
    await submitToAPI({ text }, 'text');
  };

  // --- Camera (native iOS camera; falls back to library on Simulator) ---
  const takePhoto = async () => {
    let result: ImagePicker.ImagePickerResult;
    try {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) { Alert.alert('Camera permission required'); return; }
      result = await ImagePicker.launchCameraAsync({
        base64: true, quality: 0.7, allowsEditing: false,
      });
    } catch {
      // Simulator has no camera — fall back to photo library
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { Alert.alert('Photo library permission required'); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        base64: true, quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  // --- Core API submit ---
  const submitToAPI = async (
    body: { text?: string },
    method: 'text'
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/parse-workout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.exercises?.length > 0) {
        await addToTranscript(method, body.text || '', data.exercises, data.notes);
      } else {
        Alert.alert('Nothing recognised', 'Try describing the exercise differently');
      }
    } catch {
      Alert.alert('Failed to reach backend — is the server running?');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Add to session transcript ---
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

  // --- Finish session ---
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
        const debriefRes = await fetch(`${API_BASE}/api/ai/parse-workout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Give me a brief coaching summary (3-4 sentences) for this workout: ${session.exercises.map(e => `${e.name} ${e.sets}x${e.reps} @ ${e.weight}lbs`).join(', ')}. PRs: ${result.prs?.map((p: any) => p.exerciseName).join(', ') || 'none'}.`,
          }),
        });
        const debrief = await debriefRes.json();
        setAiDebrief(debrief.notes || null);
      } catch { /* non-critical */ }

      const prNote = result.prs?.length
        ? `${result.prs.length} PR${result.prs.length > 1 ? 's' : ''} hit! 🏆`
        : 'Session saved';
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

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    startBtn: {
      backgroundColor: colors.accent, borderRadius: 24,
      paddingVertical: 18, paddingHorizontal: 48,
    },
    startBtnText: { fontSize: 18, fontWeight: '800', color: '#fff' },
    startHint: { color: colors.textDim, fontSize: 14, marginTop: 16, textAlign: 'center' },
    sessionWrap: { flex: 1 },
    timerBar: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    timer: { fontSize: 32, fontWeight: '800', color: colors.accent },
    finishBtn: {
      backgroundColor: colors.success, borderRadius: 12,
      paddingVertical: 8, paddingHorizontal: 18,
    },
    finishBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    transcript: { flex: 1 },
    transcriptContent: { padding: 16, gap: 10 },
    entry: {
      backgroundColor: colors.surface, borderRadius: 12,
      padding: 12, borderWidth: 1, borderColor: colors.border,
      flexDirection: 'row', gap: 10,
    },
    entryIcon: { fontSize: 18 },
    entryBody: { flex: 1 },
    entryExName: { fontSize: 14, fontWeight: '600', color: colors.text },
    entryStats: { fontSize: 13, color: colors.accent, marginTop: 2 },
    entryLast: { fontSize: 12, color: colors.textDim, marginTop: 2 },
    entryDelete: { padding: 4 },
    entryDeleteText: { fontSize: 16, color: colors.danger },
    emptyTranscript: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
    emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 12 },
    inputBar: {
      flexDirection: 'row', gap: 8, padding: 12,
      borderTopWidth: 1, borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    textInput: {
      flex: 1, backgroundColor: colors.bg, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
      color: colors.text, fontSize: 15,
      borderWidth: 1, borderColor: colors.border,
    },
    iconBtn: {
      width: 46, height: 46, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    camBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    sendBtn: { backgroundColor: colors.accent },
    iconBtnText: { fontSize: 20 },
    reviewWrap: { flex: 1, backgroundColor: colors.bg, padding: 24 },
    reviewTitle: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 },
    reviewSub: { fontSize: 15, color: colors.accent, fontWeight: '600', marginBottom: 24 },
    reviewCard: {
      backgroundColor: colors.surface, borderRadius: 16,
      padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    reviewExName: { fontSize: 15, fontWeight: '700', color: colors.text },
    reviewExStats: { fontSize: 14, color: colors.accent, marginTop: 4 },
    debriefBox: {
      backgroundColor: colors.accentDim, borderRadius: 16,
      padding: 16, marginBottom: 24,
    },
    debriefLabel: { fontSize: 12, fontWeight: '700', color: colors.accent, marginBottom: 6, letterSpacing: 1 },
    debriefText: { fontSize: 14, color: colors.text, lineHeight: 22 },
    doneBtn: {
      backgroundColor: colors.accent, borderRadius: 16,
      paddingVertical: 16, alignItems: 'center', marginTop: 8,
    },
    doneBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
    processingOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },
    processingText: { color: '#fff', fontSize: 15, marginTop: 12 },
  });

  const methodIcon = (m: string) => m === 'camera' ? '📸' : '⌨️';

  // --- Review Screen ---
  if (showReview && parsedResult) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView style={s.reviewWrap}>
          <Text style={s.reviewTitle}>Session Complete 💪</Text>
          <Text style={s.reviewSub}>{parsedResult.notes}</Text>

          {aiDebrief && (
            <View style={s.debriefBox}>
              <Text style={s.debriefLabel}>LOFTE COACH</Text>
              <Text style={s.debriefText}>{aiDebrief}</Text>
            </View>
          )}

          {parsedResult.exercises.map((ex, i) => (
            <View key={i} style={s.reviewCard}>
              <Text style={s.reviewExName}>{ex.name}</Text>
              <Text style={s.reviewExStats}>
                {ex.sets && ex.reps
                  ? `${ex.sets} sets × ${ex.reps} reps${ex.weight ? ` @ ${ex.weight} lbs` : ''}`
                  : ex.distance ? `${ex.distance}m` : ex.duration ? `${Math.round(ex.duration / 60)} min` : '—'}
              </Text>
            </View>
          ))}

          <TouchableOpacity style={s.doneBtn} onPress={handleDoneReview}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Pre-session ---
  if (!session.isActive) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <TouchableOpacity style={s.startBtn} onPress={onStart}>
            <Text style={s.startBtnText}>Start Session</Text>
          </TouchableOpacity>
          <Text style={s.startHint}>Type a log or snap a photo of the machine display</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Active Session ---
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.sessionWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={s.timerBar}>
          <Text style={s.timer}>{formatTime(getElapsed())}</Text>
          <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
            <Text style={s.finishBtnText}>Finish</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.transcript} contentContainerStyle={s.transcriptContent} showsVerticalScrollIndicator={false}>
          {session.transcript.length === 0 && (
            <View style={s.emptyTranscript}>
              <Text style={{ fontSize: 36 }}>⌨️</Text>
              <Text style={s.emptyText}>
                Type a log below{'\n'}e.g. "bench 3x10 at 135 lbs"
              </Text>
            </View>
          )}
          {session.transcript.map(entry => (
            <View key={entry.id} style={s.entry}>
              <Text style={s.entryIcon}>{methodIcon(entry.method)}</Text>
              <View style={s.entryBody}>
                {entry.exercises?.map((ex, i) => {
                  const key = ex.name.toLowerCase();
                  const last = lastPerformance[key];
                  return (
                    <View key={i}>
                      <Text style={s.entryExName}>{ex.name}</Text>
                      <Text style={s.entryStats}>
                        {ex.sets && ex.reps
                          ? `${ex.sets}×${ex.reps}${ex.weight ? ` @ ${ex.weight}lbs` : ''}`
                          : ex.distance ? `${ex.distance}m` : '—'}
                      </Text>
                      {last?.weight && (
                        <Text style={s.entryLast}>
                          Last: {last.sets}×{last.reps} @ {last.weight}lbs
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity style={s.entryDelete} onPress={() => removeEntry(entry.id)}>
                <Text style={s.entryDeleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <View style={s.inputBar}>
          <TextInput
            style={s.textInput}
            placeholder='e.g. "bench 3x10 at 135"'
            placeholderTextColor={colors.textDim}
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={submitText}
            returnKeyType="send"
          />
          <TouchableOpacity style={[s.iconBtn, s.camBtn]} onPress={takePhoto}>
            <Text style={s.iconBtnText}>📸</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: colors.accent }]}
            onPress={submitText}
          >
            <Text style={s.iconBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {isProcessing && (
        <View style={s.processingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={s.processingText}>Processing…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
