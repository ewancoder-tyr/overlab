namespace OverLab.Domain;

public sealed record ExerciseSession(ExerciseName Exercise, List<Set> Sets);