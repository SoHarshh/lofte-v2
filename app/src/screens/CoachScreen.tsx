import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  ActionSheetIOS, Alert, Linking, Image as RNImage,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { API_BASE } from '../config';
import { useAuthFetch } from '../hooks/useAuthFetch';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

interface Message {
  id: string;
  role: 'user' | 'coach';
  text: string;
  image?: string; // base64 thumbnail (not stored to disk — too large)
}

interface Props { colors: Record<string, string>; }

const STARTERS = [
  "How's my training looking?",
  "What should I hit next session?",
  "Am I overtraining anything?",
];

export default function CoachScreen({ colors }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const recordingActiveRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const authFetch = useAuthFetch();
  const { getToken } = useAuth();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const scrollToBottom = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  // ── Send message ──
  const send = useCallback(async (text: string, image?: string | null) => {
    const trimmed = text.trim();
    if ((!trimmed && !image) || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: trimmed || '(sent an image)',
      image: image || undefined,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setAttachedImage(null);
    setLoading(true);
    scrollToBottom();

    try {
      const body: any = { message: trimmed };
      if (image) body.imageBase64 = image;

      const res = await authFetch(`${API_BASE}/api/ai/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      const coachMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'coach',
        text: data.reply || "Sorry, I had trouble with that one.",
      };
      setMessages(prev => [...prev, coachMsg]);
      scrollToBottom();
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'coach',
        text: 'Connection issue. Check your network and try again.',
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, authFetch]);

  // ── Voice recording ──
  const startRecording = async () => {
    if (recordingActiveRef.current) return;
    recordingActiveRef.current = true;
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        recordingActiveRef.current = false;
        Alert.alert('Microphone Required', 'Enable microphone access in Settings.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      await audioRecorder.record();
      setIsRecording(true);
    } catch {
      recordingActiveRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (!recordingActiveRef.current) return;
    recordingActiveRef.current = false;
    setIsRecording(false);

    let uri: string | null = null;
    try {
      await audioRecorder.stop();
      uri = audioRecorder.uri;
    } catch { return; }
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const file = new File(uri);
      const base64 = await file.base64();
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/ai/transcribe`, {
        method: 'POST', headers,
        body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/m4a' }),
      });
      const data = await res.json();
      if (data.text?.trim()) {
        setInput(prev => (prev ? prev + ' ' : '') + data.text.trim());
      }
    } catch {
      Alert.alert('Transcription failed', 'Could not convert speech to text.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // ── Image picker ──
  const showImageOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        idx => { if (idx === 1) pickImage(true); else if (idx === 2) pickImage(false); },
      );
    } else {
      Alert.alert('Add Image', '', [
        { text: 'Camera', onPress: () => pickImage(true) },
        { text: 'Photo Library', onPress: () => pickImage(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const pickImage = async (useCamera: boolean) => {
    let result: ImagePicker.ImagePickerResult;
    if (useCamera) {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) { Alert.alert('Camera permission required'); return; }
      result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 });
    } else {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { Alert.alert('Photo library permission required'); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        base64: true, quality: 0.6,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
    }
    if (!result.canceled && result.assets?.[0]?.base64) {
      setAttachedImage(result.assets[0].base64);
    }
  };

  // ── Clear chat ──
  const clearChat = () => {
    Alert.alert('Clear conversation?', "Nyx will lose memory of past conversations.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: () => {
          setMessages([]);
          authFetch(`${API_BASE}/api/coach/history`, { method: 'DELETE' }).catch(() => {});
        },
      },
    ]);
  };

  // ── Render ──
  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[s.msgRow, isUser && s.msgRowUser]}>
        {!isUser && (
          <View style={s.coachAvatar}>
            <Ionicons name="sparkles" size={12} color="rgba(255,255,255,0.65)" />
          </View>
        )}
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleCoach]}>
          {item.image && (
            <RNImage
              source={{ uri: `data:image/jpeg;base64,${item.image}` }}
              style={s.bubbleImage}
              resizeMode="cover"
            />
          )}
          <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  const hasInput = input.trim().length > 0 || attachedImage;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => navigation.navigate('Home' as never)}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.70)" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Ionicons name="sparkles" size={13} color="rgba(255,255,255,0.45)" style={{ marginRight: 5 }} />
          <Text style={[s.headerTitle, { fontFamily: SERIF }]}>Nyx</Text>
        </View>
        <TouchableOpacity
          style={s.backBtn}
          onPress={clearChat}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={17} color="rgba(255,255,255,0.40)" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[
          s.listContent,
          messages.length === 0 && s.listEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToBottom}
        ListEmptyComponent={(
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Ionicons name="sparkles" size={30} color="rgba(255,255,255,0.50)" />
            </View>
            <Text style={[s.emptyTitle, { fontFamily: SERIF }]}>Nyx</Text>
            <Text style={s.emptySubtitle}>Your personal training AI</Text>
            <View style={s.starterList}>
              {STARTERS.map(q => (
                <TouchableOpacity
                  key={q}
                  style={s.starterPill}
                  onPress={() => send(q)}
                  activeOpacity={0.75}
                >
                  <Text style={s.starterText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        ListFooterComponent={loading ? (
          <View style={s.msgRow}>
            <View style={s.coachAvatar}>
              <Ionicons name="sparkles" size={12} color="rgba(255,255,255,0.65)" />
            </View>
            <View style={[s.bubble, s.bubbleCoach, s.typingBubble]}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.40)" />
            </View>
          </View>
        ) : null}
      />

      {/* Attached image preview */}
      {attachedImage && (
        <View style={s.attachPreview}>
          <RNImage
            source={{ uri: `data:image/jpeg;base64,${attachedImage}` }}
            style={s.attachThumb}
            resizeMode="cover"
          />
          <TouchableOpacity style={s.attachRemove} onPress={() => setAttachedImage(null)}>
            <Ionicons name="close-circle" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.inputRow}>
          {/* Plus button */}
          <TouchableOpacity style={s.circleBtn} onPress={showImageOptions} activeOpacity={0.7}>
            <Ionicons name="add" size={22} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>

          {/* Text input pill */}
          <View style={s.inputPill}>
            {isTranscribing ? (
              <View style={s.transcribingRow}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.45)" />
                <Text style={s.transcribingText}>Transcribing</Text>
              </View>
            ) : isRecording ? (
              <View style={s.recordingRow}>
                <View style={s.recordingDot} />
                <Text style={s.recordingText}>Recording...</Text>
              </View>
            ) : (
              <TextInput
                style={s.input}
                placeholder="Ask Nyx..."
                placeholderTextColor="rgba(255,255,255,0.28)"
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500}
                selectionColor="rgba(255,255,255,0.5)"
              />
            )}
          </View>

          {/* Right button: mic / stop / send */}
          {isRecording ? (
            <TouchableOpacity style={[s.circleBtn, s.circleBtnActive]} onPress={stopRecording} activeOpacity={0.7}>
              <Ionicons name="stop" size={16} color="#050B14" />
            </TouchableOpacity>
          ) : hasInput ? (
            <TouchableOpacity
              style={[s.circleBtn, s.circleBtnSend]}
              onPress={() => send(input, attachedImage)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.circleBtn} onPress={startRecording} activeOpacity={0.7}>
              <Ionicons name="mic" size={20} color="rgba(255,255,255,0.70)" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '400', color: '#fff' },

  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  listEmpty: { flex: 1, justifyContent: 'center' },

  emptyState: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 24, fontWeight: '400', color: '#fff', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.40)', marginBottom: 28, letterSpacing: 0.2 },
  starterList: { width: '100%', gap: 8 },
  starterPill: {
    paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  starterText: { fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: '400' },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 8 },
  msgRowUser: { justifyContent: 'flex-end' },
  coachAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleUser: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    borderBottomRightRadius: 4,
  },
  bubbleCoach: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, color: 'rgba(255,255,255,0.60)', lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleImage: { width: 180, height: 140, borderRadius: 12, marginBottom: 8 },
  typingBubble: { paddingVertical: 12, paddingHorizontal: 16 },

  // Attached image preview
  attachPreview: {
    paddingHorizontal: 20, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  attachThumb: { width: 56, height: 56, borderRadius: 12 },
  attachRemove: { marginLeft: -12, marginTop: -40 },

  // Input bar
  inputBar: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 10, gap: 8, zIndex: 1,
  },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  circleBtnActive: {
    backgroundColor: '#fff', borderColor: '#fff',
  },
  circleBtnSend: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)',
  },
  inputPill: {
    flex: 1, minHeight: 38, maxHeight: 120,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', paddingHorizontal: 16,
    marginBottom: 2,
  },
  input: { fontSize: 15, color: '#fff', paddingVertical: 8 },
  transcribingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  transcribingText: { fontSize: 14, color: 'rgba(255,255,255,0.40)' },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recordingText: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
});
