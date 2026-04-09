export interface ExerciseTemplate {
  name: string;
  muscle: string;
}

export const EXERCISES: ExerciseTemplate[] = [
  // Chest
  { name: 'Bench Press', muscle: 'Chest' },
  { name: 'Incline Bench Press', muscle: 'Chest' },
  { name: 'Decline Bench Press', muscle: 'Chest' },
  { name: 'Dumbbell Fly', muscle: 'Chest' },
  { name: 'Cable Fly', muscle: 'Chest' },
  { name: 'Push Up', muscle: 'Chest' },
  { name: 'Chest Dip', muscle: 'Chest' },
  { name: 'Pec Deck', muscle: 'Chest' },
  // Back
  { name: 'Deadlift', muscle: 'Back' },
  { name: 'Pull Up', muscle: 'Back' },
  { name: 'Chin Up', muscle: 'Back' },
  { name: 'Barbell Row', muscle: 'Back' },
  { name: 'Seated Cable Row', muscle: 'Back' },
  { name: 'Lat Pulldown', muscle: 'Back' },
  { name: 'T-Bar Row', muscle: 'Back' },
  { name: 'Single Arm Dumbbell Row', muscle: 'Back' },
  { name: 'Face Pull', muscle: 'Back' },
  { name: 'Straight Arm Pulldown', muscle: 'Back' },
  // Shoulders
  { name: 'Overhead Press', muscle: 'Shoulders' },
  { name: 'Dumbbell Shoulder Press', muscle: 'Shoulders' },
  { name: 'Lateral Raise', muscle: 'Shoulders' },
  { name: 'Front Raise', muscle: 'Shoulders' },
  { name: 'Rear Delt Fly', muscle: 'Shoulders' },
  { name: 'Upright Row', muscle: 'Shoulders' },
  { name: 'Arnold Press', muscle: 'Shoulders' },
  { name: 'Cable Lateral Raise', muscle: 'Shoulders' },
  // Biceps
  { name: 'Barbell Curl', muscle: 'Biceps' },
  { name: 'Dumbbell Curl', muscle: 'Biceps' },
  { name: 'Hammer Curl', muscle: 'Biceps' },
  { name: 'Preacher Curl', muscle: 'Biceps' },
  { name: 'Cable Curl', muscle: 'Biceps' },
  { name: 'Concentration Curl', muscle: 'Biceps' },
  { name: 'Incline Dumbbell Curl', muscle: 'Biceps' },
  // Triceps
  { name: 'Tricep Pushdown', muscle: 'Triceps' },
  { name: 'Skull Crusher', muscle: 'Triceps' },
  { name: 'Overhead Tricep Extension', muscle: 'Triceps' },
  { name: 'Close Grip Bench Press', muscle: 'Triceps' },
  { name: 'Tricep Dip', muscle: 'Triceps' },
  { name: 'Cable Overhead Tricep Extension', muscle: 'Triceps' },
  // Quads
  { name: 'Squat', muscle: 'Quads' },
  { name: 'Leg Press', muscle: 'Quads' },
  { name: 'Leg Extension', muscle: 'Quads' },
  { name: 'Hack Squat', muscle: 'Quads' },
  { name: 'Lunges', muscle: 'Quads' },
  { name: 'Bulgarian Split Squat', muscle: 'Quads' },
  { name: 'Front Squat', muscle: 'Quads' },
  { name: 'Step Up', muscle: 'Quads' },
  // Hamstrings
  { name: 'Romanian Deadlift', muscle: 'Hamstrings' },
  { name: 'Leg Curl', muscle: 'Hamstrings' },
  { name: 'Good Morning', muscle: 'Hamstrings' },
  { name: 'Nordic Curl', muscle: 'Hamstrings' },
  { name: 'Stiff Leg Deadlift', muscle: 'Hamstrings' },
  // Glutes
  { name: 'Hip Thrust', muscle: 'Glutes' },
  { name: 'Glute Bridge', muscle: 'Glutes' },
  { name: 'Cable Kickback', muscle: 'Glutes' },
  { name: 'Sumo Squat', muscle: 'Glutes' },
  // Calves
  { name: 'Standing Calf Raise', muscle: 'Calves' },
  { name: 'Seated Calf Raise', muscle: 'Calves' },
  { name: 'Leg Press Calf Raise', muscle: 'Calves' },
  // Core
  { name: 'Plank', muscle: 'Core' },
  { name: 'Crunch', muscle: 'Core' },
  { name: 'Cable Crunch', muscle: 'Core' },
  { name: 'Leg Raise', muscle: 'Core' },
  { name: 'Russian Twist', muscle: 'Core' },
  { name: 'Ab Wheel Rollout', muscle: 'Core' },
  { name: 'Hanging Knee Raise', muscle: 'Core' },
  { name: 'Side Plank', muscle: 'Core' },
  // Cardio
  { name: 'Running', muscle: 'Cardio' },
  { name: 'Cycling', muscle: 'Cardio' },
  { name: 'Rowing', muscle: 'Cardio' },
  { name: 'Jump Rope', muscle: 'Cardio' },
  { name: 'Elliptical', muscle: 'Cardio' },
  { name: 'Stair Climber', muscle: 'Cardio' },
  { name: 'Swimming', muscle: 'Cardio' },
];

export const MUSCLE_GROUPS = [...new Set(EXERCISES.map(e => e.muscle))];
