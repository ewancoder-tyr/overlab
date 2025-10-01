using OverLab.Domain;
using System.Reflection;
using Tyr.Framework;

var isDebug = false;
#if DEBUG
isDebug = true;
#endif

var builder = WebApplication.CreateBuilder(args);

var config = TyrHostConfiguration.Default(
    builder.Configuration,
    "OverLab",
    isDebug: isDebug);

await builder.ConfigureTyrApplicationBuilderAsync(config);

var app = builder.Build();
app.ConfigureTyrApplication(config);
app.UseMiddleware<DomainValidationExceptionMiddleware>();

var repo = new ExerciseProgressRepository();

app.MapGet(
    "/api/exercises",
    () => Results.Ok(ExerciseName.KnownExercises));

app.MapPost(
    "/api/exercises/{exercise}/sets",
    async (string exercise, RepsDto reps) =>
    {
        var progress = await repo.FindByExerciseAsync(new(exercise));

        progress.CompleteSet(new(reps.Reps));

        await repo.SaveAsync(progress);

        return Results.Created();
    });

app.MapGet(
    "/api/exercises/{exercise}/sets",
    async (string exercise) =>
    {
        var progress = await repo.FindByExerciseAsync(new(exercise));

        var workoutSessions = WorkoutOrganizer.OrganizeWorkouts(progress);

        return Results.Ok(workoutSessions);
    });

await app.RunAsync();

public sealed class DomainValidationExceptionMiddleware
{
    private readonly RequestDelegate _next;

    public DomainValidationExceptionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainValidationException ex)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new { error = ex.Message });
        }
    }
}

public sealed class ExerciseProgressRepository
{
    private readonly Dictionary<ExerciseName, ExerciseProgress> _data = new();
    public async ValueTask<ExerciseProgress> FindByExerciseAsync(ExerciseName exercise)
    {
        if (!_data.TryGetValue(exercise, out var progress))
        {
            progress = ExerciseProgress.Hydrate(TimeProvider.System, exercise, []);
            _data[exercise] = progress;
        }

        return progress;
    }

    public async ValueTask SaveAsync(ExerciseProgress exerciseProgress)
    {
        var field = typeof(ExerciseProgress).GetField("_exercise", BindingFlags.NonPublic | BindingFlags.Instance);
        var exerciseName = (ExerciseName)field!.GetValue(exerciseProgress)!;
        _data[exerciseName] = exerciseProgress;
    }
}

public sealed record RepsDto(string Reps);
