import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2, CheckCircle2, AlertCircle, Keyboard, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VoiceRecorderProps {
  onDataExtracted: (data: any) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onDataExtracted }) => {
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus('recording');
      setError(null);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
      setStatus('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setStatus('processing');
    }
  };

  const processWorkoutData = async (workoutData: any) => {
    if (!workoutData.exercises || workoutData.exercises.length === 0) {
      throw new Error("No exercises detected in your input.");
    }

    onDataExtracted(workoutData);
    setStatus('success');
    setTextInput('');
    setTimeout(() => setStatus('idle'), 3000);
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });

      const response = await fetch('/api/ai/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64Audio, mimeType: 'audio/webm' }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to process audio');
      }

      const workoutData = await response.json();
      await processWorkoutData(workoutData);
    } catch (err: any) {
      console.error('Error processing audio:', err);
      setError(err.message || 'Failed to process workout. Try speaking more clearly.');
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || isProcessing) return;

    setStatus('processing');
    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to process workout');
      }

      const workoutData = await response.json();
      await processWorkoutData(workoutData);
    } catch (err: any) {
      console.error('Error processing text:', err);
      setError(err.message || 'Failed to process workout. Try describing it differently.');
      setStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center justify-center p-8 bg-white rounded-3xl shadow-xl border border-black/5">
      {/* Mode Toggle */}
      <div className="flex bg-zinc-100 p-1 rounded-2xl mb-8">
        <button
          onClick={() => { setMode('voice'); setStatus('idle'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${mode === 'voice' ? 'bg-white text-black shadow-sm' : 'text-zinc-500'}`}
        >
          <Mic size={16} />
          Voice
        </button>
        <button
          onClick={() => { setMode('text'); setStatus('idle'); setError(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${mode === 'text' ? 'bg-white text-black shadow-sm' : 'text-zinc-500'}`}
        >
          <Keyboard size={16} />
          Text
        </button>
      </div>

      <div className="relative w-full flex flex-col items-center">
        <AnimatePresence mode="wait">
          {mode === 'voice' ? (
            <div key="voice-mode" className="flex flex-col items-center">
              <div className="relative">
                <AnimatePresence mode="wait">
                  {status === 'idle' && (
                    <motion.button
                      key="idle"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      onClick={startRecording}
                      className="w-24 h-24 rounded-full bg-black text-white flex items-center justify-center hover:bg-zinc-800 transition-colors shadow-lg"
                    >
                      <Mic size={32} />
                    </motion.button>
                  )}

                  {status === 'recording' && (
                    <motion.button
                      key="recording"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      onClick={stopRecording}
                      className="w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center animate-pulse shadow-lg"
                    >
                      <Square size={32} />
                    </motion.button>
                  )}

                  {status === 'processing' && (
                    <motion.div
                      key="processing"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="w-24 h-24 rounded-full bg-zinc-100 text-black flex items-center justify-center"
                    >
                      <Loader2 size={32} className="animate-spin" />
                    </motion.div>
                  )}

                  {status === 'success' && (
                    <motion.div
                      key="success"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="w-24 h-24 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"
                    >
                      <CheckCircle2 size={32} />
                    </motion.div>
                  )}

                  {status === 'error' && (
                    <motion.button
                      key="error"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      onClick={startRecording}
                      className="w-24 h-24 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg"
                    >
                      <AlertCircle size={32} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-6 text-center">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {status === 'idle' && "Tap to start logging"}
                  {status === 'recording' && "Recording... Tap to finish"}
                  {status === 'processing' && "Analyzing your workout..."}
                  {status === 'success' && "Workout logged successfully!"}
                  {status === 'error' && "Something went wrong"}
                </h3>
                <p className="text-sm text-zinc-500 mt-1 max-w-xs">
                  {status === 'idle' && "Speak naturally: 'I did 3 sets of 10 bench press at 135 lbs'"}
                  {status === 'error' && error}
                </p>
              </div>
            </div>
          ) : (
            <motion.div 
              key="text-mode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full"
            >
              <form onSubmit={handleTextSubmit} className="space-y-4">
                <div className="relative">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Describe your workout..."
                    className="w-full min-h-[120px] p-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all resize-none"
                    disabled={status === 'processing'}
                  />
                  <div className="absolute bottom-3 right-3">
                    <button
                      type="submit"
                      disabled={!textInput.trim() || status === 'processing'}
                      className="p-3 bg-black text-white rounded-xl hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 transition-all shadow-sm"
                    >
                      {status === 'processing' ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                    </button>
                  </div>
                </div>
                
                <div className="text-center">
                  <AnimatePresence mode="wait">
                    {status === 'success' && (
                      <motion.p 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="text-emerald-600 text-sm font-medium flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 size={14} /> Workout logged!
                      </motion.p>
                    )}
                    {status === 'error' && (
                      <motion.p 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="text-amber-600 text-sm font-medium"
                      >
                        {error}
                      </motion.p>
                    )}
                    {status === 'idle' && (
                      <p className="text-xs text-zinc-400">
                        Example: "Bench press 3x10 at 135lbs, then 3 sets of 12 pullups"
                      </p>
                    )}
                  </AnimatePresence>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

