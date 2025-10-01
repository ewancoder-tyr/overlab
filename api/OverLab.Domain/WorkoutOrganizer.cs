namespace OverLab.Domain;

public sealed class WorkoutOrganizer
{
    public static readonly TimeSpan TimeBetweenWorkouts = TimeSpan.FromHours(4);

    // TODO: Untested. Remove this method, query model shouldn't use aggregates.
    public static IEnumerable<ExerciseSession> OrganizeWorkouts(ExerciseProgress exerciseProgress)
    {
        var exercise = exerciseProgress.Exercise;
        var sets = exerciseProgress.Sets;

        return OrganizeWorkouts(exercise, sets);
    }

    // TODO: Add more statistical data to ExerciseSession, like the start time and the end time of the whole set for this particular workout.
    public static IEnumerable<ExerciseSession> OrganizeWorkouts(ExerciseName exercise, IEnumerable<Set> sets)
    {
        foreach (var workoutSet in GetWorkoutSets(sets))
        {
            yield return new ExerciseSession(exercise, workoutSet);
        }
    }

    private static IEnumerable<List<Set>> GetWorkoutSets(IEnumerable<Set> sets)
    {
        var workoutSets = new List<Set>();
        foreach (var set in sets)
        {
            if (workoutSets.Count == 0)
            {
                workoutSets.Add(set);
                continue;
            }

            if (set.TimeStamp - workoutSets.Last().TimeStamp < TimeBetweenWorkouts)
            {
                workoutSets.Add(set);
                continue;
            }

            yield return workoutSets;
            workoutSets = [set];
        }

        if (workoutSets.Count > 0)
            yield return workoutSets;
    }
}
