import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EXERCISES, MUSCLE_GROUPS } from '../data/exercises';

interface Props {
  visible: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function ExercisePicker({ visible, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter(e => {
      const matchesQuery = !q || e.name.toLowerCase().includes(q);
      const matchesMuscle = !selectedMuscle || e.muscle === selectedMuscle;
      return matchesQuery && matchesMuscle;
    });
  }, [query, selectedMuscle]);

  const handleSelect = (name: string) => {
    onSelect(name);
    setQuery('');
    setSelectedMuscle(null);
    onClose();
  };

  const handleCustom = () => {
    const trimmed = query.trim();
    if (trimmed) {
      handleSelect(trimmed);
    }
  };

  const showCustom = query.trim().length > 0 && !EXERCISES.some(
    e => e.name.toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Handle */}
          <View style={s.handle} />

          {/* Search */}
          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.35)" style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="words"
              selectionColor="rgba(255,255,255,0.5)"
              returnKeyType="done"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Muscle group pills */}
          <FlatList
            data={['All', ...MUSCLE_GROUPS]}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item}
            contentContainerStyle={s.pillRow}
            ItemSeparatorComponent={() => <View style={s.pillSpacer} />}
            renderItem={({ item }) => {
              const active = item === 'All' ? !selectedMuscle : selectedMuscle === item;
              return (
                <TouchableOpacity
                  style={[s.pill, active && s.pillActive]}
                  onPress={() => setSelectedMuscle(item === 'All' ? null : item)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.pillText, active && s.pillTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            }}
          />

          {/* Exercise list */}
          <FlatList
            data={filtered}
            keyExtractor={item => item.name}
            style={s.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={s.row} onPress={() => handleSelect(item.name)} activeOpacity={0.7}>
                <View style={s.rowInner}>
                  <Text style={s.rowName}>{item.name}</Text>
                  <Text style={s.rowMuscle}>{item.muscle}</Text>
                </View>
                <Ionicons name="add" size={18} color="rgba(255,255,255,0.30)" />
              </TouchableOpacity>
            )}
            ListHeaderComponent={showCustom ? (
              <TouchableOpacity style={[s.row, s.customRow]} onPress={handleCustom} activeOpacity={0.7}>
                <View style={s.rowInner}>
                  <Text style={s.rowName}>"{query.trim()}"</Text>
                  <Text style={s.rowMuscle}>Custom exercise</Text>
                </View>
                <Ionicons name="add-circle" size={18} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            ) : null}
            ListEmptyComponent={
              !showCustom ? (
                <Text style={s.empty}>No exercises found</Text>
              ) : null
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    maxHeight: '82%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginTop: 12, marginBottom: 16,
    zIndex: 1,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    zIndex: 1,
  },
  searchInput: {
    flex: 1, fontSize: 15, color: '#fff',
  },
  pillRow: {
    paddingHorizontal: 16, paddingBottom: 12, paddingVertical: 4,
    zIndex: 1,
  },
  pillSpacer: {
    width: 8,
  },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 100, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  pillText: {
    fontSize: 12, fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  pillTextActive: {
    color: '#050B14',
  },
  list: { zIndex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  customRow: {
    borderBottomColor: 'rgba(255,255,255,0.12)',
    marginBottom: 4,
  },
  rowInner: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '500', color: '#fff', marginBottom: 2 },
  rowMuscle: { fontSize: 12, color: 'rgba(255,255,255,0.40)' },
  empty: {
    textAlign: 'center', color: 'rgba(255,255,255,0.30)',
    fontSize: 14, paddingVertical: 32,
  },
});
