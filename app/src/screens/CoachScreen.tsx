import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../config';
import { useAuthFetch } from '../hooks/useAuthFetch';

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

interface Message {
  id: string;
  role: 'user' | 'coach';
  text: string;
}

interface Props { colors: Record<string, string>; }

const NYX_INTRO: Message = {
  id: 'nyx-intro',
  role: 'coach',
  text: "Hey, I'm Nyx — your personal training AI. I have full access to your workout history, PRs, and training patterns.\n\nI can help you break through plateaus, plan your next session, understand your progress trends, or answer any training question you have.\n\nWhere do you want to start?",
};

const STARTERS = [
  "How's my training looking lately?",
  "What should I focus on next session?",
  "Why might my progress be stalling?",
];

export default function CoachScreen({ colors }: Props) {
  const [messages, setMessages] = useState<Message[]>([NYX_INTRO]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const authFetch = useAuthFetch();

  const scrollToBottom = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      // Build history for backend — exclude the static intro message
      const chatHistory = messages
        .filter(m => m.id !== 'nyx-intro')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          text: m.text,
        }));

      const res = await authFetch(`${API_BASE}/api/ai/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, chatHistory }),
      });
      const data = await res.json();

      const coachMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'coach',
        text: data.reply || 'Sorry, I had trouble with that one.',
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
          <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.text}</Text>
        </View>
      </View>
    );
  };

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
        <View style={{ width: 38 }} />
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
            <Text style={[s.emptyTitle, { fontFamily: SERIF }]}>Ask your coach</Text>
            <Text style={s.emptySubtitle}>Trained on your full workout history</Text>
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

      {/* Input bar */}
      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.inputBarBorder} />
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Ask your coach..."
            placeholderTextColor="rgba(255,255,255,0.28)"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            selectionColor="rgba(255,255,255,0.5)"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-up"
              size={17}
              color={input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.22)'}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row', alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17, fontWeight: '400', color: '#fff',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24, fontWeight: '400', color: '#fff', marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13, color: 'rgba(255,255,255,0.40)',
    marginBottom: 28, letterSpacing: 0.2,
  },
  starterList: { width: '100%', gap: 8 },
  starterPill: {
    paddingHorizontal: 18, paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  starterText: {
    fontSize: 14, color: 'rgba(255,255,255,0.65)',
    fontWeight: '400',
  },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },

  coachAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18,
  },
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
  bubbleText: {
    fontSize: 15, color: 'rgba(255,255,255,0.60)', lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  typingBubble: {
    paddingVertical: 12, paddingHorizontal: 16,
  },

  inputBar: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  inputBarBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
