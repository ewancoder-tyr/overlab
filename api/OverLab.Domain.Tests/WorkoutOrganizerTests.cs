namespace OverLab.Domain.Tests;

public class WorkoutOrganizerTests
{
    [Fact]
    public void OrganizeWorkouts_ShouldSplitSetsIntoWorkouts()
    {
        var now = DateTime.UtcNow;

        var sets = new List<Set>();

        // 1st workout.
        sets.Add(new Set(new(1), now, []));
        sets.Add(new Set(new(2), sets.Last().TimeStamp + TimeSpan.FromMinutes(10), []));
        sets.Add(new Set(new(3), sets.Last().TimeStamp + WorkoutOrganizer.TimeBetweenWorkouts - TimeSpan.FromMinutes(10), []));

        // 2nd workout.
        sets.Add(new Set(new(4), sets.Last().TimeStamp + WorkoutOrganizer.TimeBetweenWorkouts + TimeSpan.FromMinutes(10), []));

        // 3rd workout.
        sets.Add(new Set(new(5), sets.Last().TimeStamp + WorkoutOrganizer.TimeBetweenWorkouts + TimeSpan.FromHours(1), []));

        // 4th workout.
        sets.Add(new Set(new(6), sets.Last().TimeStamp + WorkoutOrganizer.TimeBetweenWorkouts + TimeSpan.FromMinutes(1), []));
        sets.Add(new Set(new(7), sets.Last().TimeStamp + WorkoutOrganizer.TimeBetweenWorkouts - TimeSpan.FromMinutes(1), []));
        sets.Add(new Set(new(8), sets.Last().TimeStamp + TimeSpan.FromMinutes(30), []));

        var exercise = new ExerciseName(ExerciseName.KnownExercises.First());

        var workouts = WorkoutOrganizer
            .OrganizeWorkouts(exercise, sets)
            .ToList();

        Assert.Equal(4, workouts.Count);

        Assert.Equal(3, workouts[0].Sets.Count);
        Assert.Single(workouts[1].Sets);
        Assert.Single(workouts[2].Sets);
        Assert.Equal(3, workouts[3].Sets.Count);

        Assert.Contains(sets[0], workouts[0].Sets);
        Assert.Contains(sets[1], workouts[0].Sets);
        Assert.Contains(sets[2], workouts[0].Sets);

        Assert.Contains(sets[3], workouts[1].Sets);
        Assert.Contains(sets[4], workouts[2].Sets);

        Assert.Contains(sets[5], workouts[3].Sets);
        Assert.Contains(sets[6], workouts[3].Sets);
        Assert.Contains(sets[7], workouts[3].Sets);
    }
}
