export interface Exercise {
  id?: number;
  workout_id?: number;
  name: string;
  muscleGroup?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  distance?: number;
  duration?: number;
  calories?: number;
  pace?: string;
}

export interface Workout {
  id: number;
  date: string;
  notes: string;
  exercises: Exercise[];
}

export interface TranscriptEntry {
  id: string;
  timestamp: number;
  method: 'voice' | 'text' | 'camera';
  raw: string;
  exercises?: Exercise[];
  pending?: boolean;
  rawAudio?: string;
  rawImage?: string;
  mimeType?: string;
}

export interface SessionState {
  isActive: boolean;
  startTime: string | null;
  transcript: TranscriptEntry[];
  exercises: Exercise[];
  notes: string;
}

export interface PR {
  exerciseName: string;
  newWeight: number;
  previousWeight: number | null;
}
