import React, { useEffect, useState } from 'react';
import { Trophy, Loader2, X, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PR {
  exerciseName: string;
  weight: number;
  previous: number | null;
}

interface WorkoutResultModalProps {
  isOpen: boolean;
  workoutId: number | null;
  prs: PR[];
  onClose: () => void;
}

export const WorkoutResultModal: React.FC<WorkoutResultModalProps> = ({
  isOpen, workoutId, prs, onClose,
}) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !workoutId) return;
    setSummary(null);
    setLoading(true);
    fetch(`/api/workouts/${workoutId}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prs }),
    })
      .then(r => r.json())
      .then(d => setSummary(d.summary || null))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [isOpen, workoutId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Workout Complete</h2>
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={20} className="text-zinc-500" />
              </button>
            </div>

            {prs.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">New Personal Records</p>
                {prs.map((pr, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3"
                  >
                    <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Trophy size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 text-sm">{pr.exerciseName}</p>
                      <p className="text-xs text-zinc-500">
                        {pr.weight}lbs
                        {pr.previous ? ` · was ${pr.previous}lbs` : ' · first time logged'}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="bg-zinc-50 rounded-2xl p-4 min-h-[80px]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-zinc-400" />
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">AI Coach</p>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-sm">Generating recap...</span>
                </div>
              ) : summary ? (
                <p className="text-sm text-zinc-700 leading-relaxed">{summary}</p>
              ) : (
                <p className="text-sm text-zinc-400">Summary unavailable.</p>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full bg-black text-white py-3 rounded-2xl font-bold hover:bg-zinc-800 transition-colors"
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
