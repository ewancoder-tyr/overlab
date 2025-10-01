using Microsoft.Extensions.Time.Testing;

namespace OverLab.Domain.Tests;

public class ExerciseProgressTests
{
    private readonly Fixture _fixture = new();
    private readonly ExerciseName _exercise;
    private readonly FakeTimeProvider _time;

    public ExerciseProgressTests()
    {
        _exercise = new(ExerciseName.KnownExercises.First());
        _time = new FakeTimeProvider();

        _fixture.Register<TimeProvider>(() => _time);
    }

    [Fact]
    public void ShouldHydrate_ValidData()
    {
        var sut = HydrateValid();

        Assert.NotNull(sut);
    }

    [Fact]
    public void ShouldNotHydrate_InvalidData_WithDuplicateSetIds()
    {
        var now = DateTime.UtcNow;
        var exercise = _exercise;

        var set1 = new Set(new(2), now,
        [
            new(RepType.Regular, 22.5m, 10)
        ]);

        var set2 = new Set(new(2), now,
        [
            new(RepType.Regular, 20, 8)
        ]);

        Assert.Throws<DomainValidationException>(
            () => ExerciseProgress.Hydrate(_time, exercise, [set1, set2]));
    }

    [Fact]
    public void ShouldNotHaveEvents_AfterHydration()
    {
        IAggregateRoot sut = HydrateValid();
        var events = sut.GetEvents();

        Assert.Empty(events);
    }

    [Fact]
    public void CompleteSet_ShouldCompleteSet_WithIncrementedId()
    {
        var sut = HydrateValid(latestSetId: 5);

        var newId = sut.CompleteSet(new("20kg 10"));
        Assert.Equal(6, newId.Value);

        var events = ((IAggregateRoot)sut).GetEvents();
        var @event = events.SingleOrDefault() as SetCompleted;

        Assert.NotNull(@event);
        Assert.Equal(_time.GetUtcNow(), @event.Timestamp);
        Assert.Equal(_exercise, @event.Exercise);
        Assert.Equal(6, @event.SetId.Value);

        var rep = @event.Reps.SingleOrDefault();
        Assert.NotNull(rep);
        Assert.Equal(10, rep.Amount);
        Assert.Equal(20, rep.Weight);
        Assert.Equal(RepType.Regular, rep.Type);
    }

    [Fact]
    public void CorrectSet_ShouldCorrectSet_WhenSetExists()
    {
        var sut = HydrateValid(latestSetId: 5);

        sut.CorrectSet(new(5), new("200kg 100"));

        var events = ((IAggregateRoot)sut).GetEvents();
        var @event = events.SingleOrDefault() as SetCorrected;

        Assert.NotNull(@event);
        Assert.Equal(_time.GetUtcNow(), @event.Timestamp);
        Assert.Equal(_exercise, @event.Exercise);
        Assert.Equal(5, @event.SetId.Value);

        var rep = @event.Reps.SingleOrDefault();
        Assert.NotNull(rep);
        Assert.Equal(100, rep.Amount);
        Assert.Equal(200, rep.Weight);
        Assert.Equal(RepType.Regular, rep.Type);
    }

    [Fact]
    public void CorrectSet_ShouldThrow_WhenSetDoesNotExist()
    {
        var sut = HydrateValid(latestSetId: 5);

        Assert.Throws<DomainValidationException>(
            () => sut.CorrectSet(new(6), new("200kg 100")));
    }

    [Fact]
    public void RemoveSet_ShouldRemoveSet_WhenSetExists()
    {
        var sut = HydrateValid(latestSetId: 5);

        sut.RemoveSet(new(5));

        var events = ((IAggregateRoot)sut).GetEvents();
        var @event = events.SingleOrDefault() as SetRemoved;

        Assert.NotNull(@event);
        Assert.Equal(_time.GetUtcNow(), @event.Timestamp);
        Assert.Equal(_exercise, @event.Exercise);
        Assert.Equal(5, @event.SetId.Value);
    }

    [Fact]
    public void CompleteSet_ShouldAddSetWithTheSameId_AfterAnotherSetWasRemoved()
    {
        var sut = HydrateValid(setIds: [2, 5]);
        sut.RemoveSet(new(5));

        var newId = sut.CompleteSet(new("20kg 10"));
        Assert.Equal(3, newId.Value);

        var events = ((IAggregateRoot)sut).GetEvents();
        var @event = events.LastOrDefault() as SetCompleted;

        Assert.NotNull(@event);
        Assert.Equal(_time.GetUtcNow(), @event.Timestamp);
        Assert.Equal(_exercise, @event.Exercise);
        Assert.Equal(3, @event.SetId.Value);
    }

    [Fact]
    public void RemoveSet_ShouldThrow_WhenSetDoesNotExist()
    {
        var sut = HydrateValid(latestSetId: 5);

        Assert.Throws<DomainValidationException>(
            () => sut.RemoveSet(new(6)));
    }

    [Fact]
    public void CompleteSet_ShouldWork_WhenNoSetsInitially_AndStartIndexingWithOne()
    {
        var sut = ExerciseProgress.Hydrate(_time, _exercise, []);

        var setId = sut.CompleteSet(new("20kg 30 20"));

        Assert.Equal(1, setId.Value);
    }

    /// <param name="latestSetId">Should be greater than 2.</param>
    private ExerciseProgress HydrateValid(int latestSetId = 5, int[]? setIds = null)
    {
        var now = DateTime.UtcNow;

        if (setIds is null)
        {
            var set1 = new Set(
                new(2),
                now,
                [
                    new(RepType.Regular, 22.5m, 10)
                ]);

            var set2 = new Set(
                new(latestSetId),
                now,
                [
                    new(RepType.Regular, 20, 8)
                ]);

            return ExerciseProgress.Hydrate(_time, _exercise, [set1, set2]);
        }
        else
        {
            var sets = new List<Set>();
            foreach (var setId in setIds)
            {
                var set = new Set(
                    new(setId),
                    now,
                    [
                        new(RepType.Regular, 20, 8)
                    ]);
                sets.Add(set);
            }

            return ExerciseProgress.Hydrate(_time, _exercise, sets);
        }
    }
}
