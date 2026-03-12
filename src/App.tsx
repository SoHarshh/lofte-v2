import React, { useState, useEffect } from 'react';
import { Workout, Exercise } from './types';
import { VoiceRecorder } from './components/VoiceRecorder';
import { VisionLogger } from './components/VisionLogger';
import { Dashboard } from './components/Dashboard';
import { WorkoutList } from './components/WorkoutList';
import { Modal } from './components/Modal';
import { motion, AnimatePresence } from 'motion/react';
import { Dumbbell, LayoutDashboard, List, Plus, Play, CheckCircle2, X, History as HistoryIcon, Camera, Mic } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'log'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);

  // Session State
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [currentExercises, setCurrentExercises] = useState<Exercise[]>([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [logMode, setLogMode] = useState<'smart' | 'vision'>('smart');

  // Modal States
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchWorkouts = async () => {
    try {
      const response = await fetch('/api/workouts');
      const data = await response.json();
      setWorkouts(data);
    } catch (error) {
      console.error('Failed to fetch workouts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, []);

  const handleDeleteWorkout = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/workouts/${deleteId}`, { method: 'DELETE' });
      if (response.ok) {
        setWorkouts(workouts.filter(w => w.id !== deleteId));
      }
    } catch (error) {
      console.error('Failed to delete workout:', error);
      setErrorMsg('Failed to delete workout. Please try again.');
    } finally {
      setDeleteId(null);
    }
  };

  const handleStartWorkout = () => {
    setIsWorkoutActive(true);
    setCurrentExercises([]);
    setSessionNotes('');
    setSessionDate(new Date().toISOString());
    setActiveTab('log');
  };

  const handleEndWorkout = async () => {
    if (currentExercises.length === 0) {
      setShowDiscardModal(true);
      return;
    }

    const workoutData = {
      date: sessionDate,
      notes: sessionNotes,
      exercises: currentExercises
    };

    try {
      const response = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workoutData),
      });

      if (response.ok) {
        setIsWorkoutActive(false);
        setCurrentExercises([]);
        setSessionNotes('');
        setSessionDate(null);
        fetchWorkouts();
        setActiveTab('history');
      }
    } catch (error) {
      console.error('Failed to save workout:', error);
      setErrorMsg('Failed to save workout. Please try again.');
    }
  };

  const confirmDiscard = () => {
    setIsWorkoutActive(false);
    setCurrentExercises([]);
    setSessionNotes('');
    setSessionDate(null);
    setActiveTab('dashboard');
    setShowDiscardModal(false);
  };

  const handleDataExtracted = (data: any) => {
    if (data.exercises) {
      setCurrentExercises(prev => [...prev, ...data.exercises]);
    }
    if (data.notes && !sessionNotes) {
      setSessionNotes(data.notes);
    }
  };

  const removeExercise = (index: number) => {
    setCurrentExercises(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <Dumbbell className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter">AURAFIT</h1>
          </div>
          <div className="hidden sm:flex items-center gap-1 bg-zinc-100 p-1 rounded-2xl">
            <TabButton 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
              icon={<LayoutDashboard size={18} />}
              label="Dashboard"
            />
            <TabButton 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')}
              icon={<HistoryIcon size={18} />}
              label="History"
            />
          </div>
          {!isWorkoutActive && activeTab !== 'log' && (
            <button
              onClick={handleStartWorkout}
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg"
            >
              <Play size={16} fill="currentColor" />
              START
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <Dashboard workouts={workouts} />}
            {activeTab === 'history' && <WorkoutList workouts={workouts} onDelete={handleDeleteWorkout} />}
            {activeTab === 'log' && (
              <div className="space-y-8">
                {!isWorkoutActive ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="w-20 h-20 bg-zinc-100 rounded-3xl flex items-center justify-center text-zinc-400">
                      <Plus size={40} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-zinc-900">Ready to train?</h2>
                      <p className="text-zinc-500 mt-2">Start a session to begin logging your exercises.</p>
                    </div>
                    <button
                      onClick={handleStartWorkout}
                      className="bg-black text-white px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 hover:bg-zinc-800 transition-all shadow-xl scale-105 active:scale-95"
                    >
                      <Play size={20} fill="currentColor" />
                      Start Workout
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Active Session Header */}
                    <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-black/5 shadow-sm">
                      <div>
                        <h2 className="text-xl font-bold text-zinc-900">Active Session</h2>
                        <p className="text-sm text-zinc-400">Started at {new Date(sessionDate!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <button
                        onClick={handleEndWorkout}
                        className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-lg"
                      >
                        <CheckCircle2 size={20} />
                        Finish Workout
                      </button>
                    </div>

                    {/* Input Section */}
                    <div className="flex flex-col items-center space-y-6">
                      <div className="flex bg-zinc-100 p-1 rounded-2xl">
                        <button
                          onClick={() => setLogMode('smart')}
                          className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all",
                            logMode === 'smart' ? "bg-white text-black shadow-sm" : "text-zinc-500"
                          )}
                        >
                          <Mic size={16} />
                          Voice/Text
                        </button>
                        <button
                          onClick={() => setLogMode('vision')}
                          className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all",
                            logMode === 'vision' ? "bg-white text-black shadow-sm" : "text-zinc-500"
                          )}
                        >
                          <Camera size={16} />
                          Vision Log
                        </button>
                      </div>

                      <AnimatePresence mode="wait">
                        {logMode === 'smart' ? (
                          <motion.div
                            key="smart"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="w-full flex justify-center"
                          >
                            <VoiceRecorder onDataExtracted={handleDataExtracted} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="vision"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="w-full flex justify-center"
                          >
                            <VisionLogger onDataExtracted={handleDataExtracted} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Current Exercises List */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-zinc-900 px-2">Current Exercises ({currentExercises.length})</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <AnimatePresence>
                          {currentExercises.map((ex, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center">
                                  <Dumbbell size={20} className="text-zinc-900" />
                                </div>
                                <div>
                                  <p className="font-bold text-zinc-900">{ex.name}</p>
                                  <div className="flex flex-wrap gap-2 mt-0.5">
                                    {ex.sets && <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 font-medium">{ex.sets} sets</span>}
                                    {ex.reps && <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 font-medium">{ex.reps} reps</span>}
                                    {ex.weight && <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 font-medium">{ex.weight} lbs</span>}
                                    {ex.distance && <span className="text-[10px] bg-blue-50 px-1.5 py-0.5 rounded text-blue-600 font-medium">{(ex.distance / 1000).toFixed(2)} km</span>}
                                    {ex.duration && <span className="text-[10px] bg-blue-50 px-1.5 py-0.5 rounded text-blue-600 font-medium">{Math.floor(ex.duration / 60)}m {ex.duration % 60}s</span>}
                                    {ex.calories && <span className="text-[10px] bg-orange-50 px-1.5 py-0.5 rounded text-orange-600 font-medium">{ex.calories} kcal</span>}
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => removeExercise(idx)}
                                className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                              >
                                <X size={18} />
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {currentExercises.length === 0 && (
                          <div className="col-span-full py-12 text-center bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
                            <p className="text-zinc-400 text-sm">No exercises added yet. Use voice or text above.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-lg rounded-full p-2 flex items-center gap-2 shadow-2xl border border-white/10 z-50">
        <NavButton 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')}
          icon={<LayoutDashboard size={20} />}
        />
        <button 
          onClick={() => setActiveTab('log')}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center transition-all",
            activeTab === 'log' ? "bg-white text-black scale-110" : "bg-zinc-800 text-white hover:bg-zinc-700"
          )}
        >
          {isWorkoutActive ? <Plus size={28} strokeWidth={3} /> : <Play size={24} fill="currentColor" className="ml-1" />}
        </button>
        <NavButton 
          active={activeTab === 'history'} 
          onClick={() => setActiveTab('history')}
          icon={<HistoryIcon size={20} />}
        />
      </nav>
      
      {/* Modals */}
      <Modal
        isOpen={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        onConfirm={confirmDiscard}
        title="Discard Session?"
        message="You haven't logged any exercises. Are you sure you want to discard this session?"
        confirmText="Discard"
        type="danger"
      />

      <Modal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Workout?"
        message="This action cannot be undone. Are you sure you want to delete this workout?"
        confirmText="Delete"
        type="danger"
      />

      <Modal
        isOpen={errorMsg !== null}
        onClose={() => setErrorMsg(null)}
        onConfirm={() => setErrorMsg(null)}
        title="Error"
        message={errorMsg || ''}
        confirmText="OK"
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
        active ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function NavButton({ active, onClick, icon }: { active: boolean, onClick: () => void, icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-all",
        active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      {icon}
    </button>
  );
}

