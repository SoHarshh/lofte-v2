import React, { useEffect, useState } from 'react';
import { X, Loader2, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

interface ExerciseHistoryModalProps {
  exerciseName: string | null;
  onClose: () => void;
}

export const ExerciseHistoryModal: React.FC<ExerciseHistoryModalProps> = ({ exerciseName, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exerciseName) return;
    setLoading(true);
    setHistory([]);
    fetch(`/api/exercises/history?name=${encodeURIComponent(exerciseName)}`)
      .then(r => r.json())
      .then(data => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [exerciseName]);

  const chartData = history
    .filter(h => h.weight)
    .map(h => ({
      date: format(parseISO(h.date), 'MMM d'),
      weight: h.weight,
      volume: (h.sets || 0) * (h.reps || 0) * h.weight,
    }));

  const pr = Math.max(...history.filter(h => h.weight).map(h => h.weight), 0);

  return (
    <AnimatePresence>
      {exerciseName && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-black">{exerciseName}</h2>
                {pr > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Trophy size={12} className="text-amber-500" />
                    <span className="text-sm text-zinc-400">PR: {pr}lbs</span>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={20} className="text-zinc-500" />
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={24} className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <>
                {chartData.length > 1 ? (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Weight Progression</p>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={chartData}>
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="lb" width={40} />
                        <Tooltip
                          formatter={(v: any) => [`${v}lbs`, 'Weight']}
                          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="weight"
                          stroke="#000"
                          strokeWidth={2}
                          dot={{ r: 3, fill: '#000' }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : chartData.length === 1 ? (
                  <p className="text-sm text-zinc-400 text-center py-4 bg-zinc-50 rounded-2xl">
                    One session logged so far — come back after more sessions to see trends.
                  </p>
                ) : null}

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">All Sessions</p>
                  {history.length === 0 ? (
                    <p className="text-sm text-zinc-400 py-4 text-center">No history found.</p>
                  ) : (
                    [...history].reverse().map((h, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b border-zinc-100 last:border-0">
                        <span className="text-sm text-zinc-500">{format(parseISO(h.date), 'MMM d, yyyy')}</span>
                        <div className="flex gap-1.5">
                          {h.weight && (
                            <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded-lg font-medium text-zinc-700">
                              {h.sets}×{h.reps} @ {h.weight}lbs
                            </span>
                          )}
                          {h.distance && (
                            <span className="text-xs bg-blue-50 px-2 py-0.5 rounded-lg font-medium text-blue-600">
                              {(h.distance / 1000).toFixed(2)}km
                            </span>
                          )}
                          {h.calories && (
                            <span className="text-xs bg-orange-50 px-2 py-0.5 rounded-lg font-medium text-orange-600">
                              {h.calories}kcal
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
