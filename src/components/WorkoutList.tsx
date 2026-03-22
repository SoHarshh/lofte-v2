import React from 'react';
import { Workout } from '../types';
import { format, parseISO } from 'date-fns';
import { Trash2, ChevronRight, Dumbbell } from 'lucide-react';
import { motion } from 'motion/react';

interface WorkoutListProps {
  workouts: Workout[];
  onDelete: (id: number) => void;
  onExerciseClick: (name: string) => void;
}

export const WorkoutList: React.FC<WorkoutListProps> = ({ workouts, onDelete, onExerciseClick }) => {
  if (workouts.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-zinc-900 px-2">History</h2>
      <div className="space-y-3">
        {workouts.map((workout, idx) => (
          <motion.div
            key={workout.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="group bg-white p-5 rounded-3xl shadow-sm border border-black/5 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-zinc-400">
                  {format(parseISO(workout.date), 'EEEE, MMMM do')}
                </p>
                {workout.notes && (
                  <p className="text-zinc-600 mt-1 italic text-sm">"{workout.notes}"</p>
                )}
              </div>
              <button
                onClick={() => onDelete(workout.id)}
                className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50/50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workout.exercises.map((ex, exIdx) => (
                <button
                  key={exIdx}
                  onClick={() => onExerciseClick(ex.name)}
                  className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-100 hover:bg-zinc-100 hover:border-zinc-200 transition-all text-left w-full"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Dumbbell size={16} className="text-zinc-900" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">{ex.name}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 mt-0.5">
                      {ex.sets && <span className="text-[10px] text-zinc-500">{ex.sets}s × {ex.reps}r</span>}
                      {ex.weight && <span className="text-[10px] text-zinc-500">@ {ex.weight}lbs</span>}
                      {ex.distance && <span className="text-[10px] text-blue-500 font-medium">{(ex.distance / 1000).toFixed(2)}km</span>}
                      {ex.duration && <span className="text-[10px] text-blue-500 font-medium">{Math.floor(ex.duration / 60)}m</span>}
                      {ex.calories && <span className="text-[10px] text-orange-500 font-medium">{ex.calories}kcal</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-zinc-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
