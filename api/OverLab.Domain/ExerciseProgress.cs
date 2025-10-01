namespace OverLab.Domain;

public sealed record SetCompleted(
    DateTime Timestamp,
    ExerciseName Exercise,
    SetId SetId,
    List<RepGroup> Reps)
    : DomainEvent("SetCompleted", typeof(SetCompleted), Timestamp);

public sealed record SetCorrected(
    DateTime Timestamp,
    ExerciseName Exercise,
    SetId SetId,
    List<RepGroup> Reps)
    : DomainEvent("SetCorrected", typeof(SetCorrected), Timestamp);

public sealed record SetRemoved(
    DateTime Timestamp,
    ExerciseName Exercise,
    SetId SetId)
    : DomainEvent("SetRemoved", typeof(SetRemoved), Timestamp);

public sealed class ExerciseProgress : AggregateRoot
{
    private readonly ExerciseName _exercise;
    private readonly List<Set> _sets;
    private readonly TimeProvider _timeProvider;

    // TODO: Remove these fields, query model shouldn't use aggregates.
    internal ExerciseName Exercise => _exercise;
    internal IEnumerable<Set> Sets => _sets.ToList();

    private ExerciseProgress(
        TimeProvider timeProvider,
        ExerciseName exercise,
        IEnumerable<Set> sets) : base(timeProvider)
    {
        if (sets.GroupBy(set => set.Id).Count() != sets.Count())
            throw new DomainValidationException("Duplicate sets IDs found for this exercise.");

        _timeProvider = timeProvider;
        _exercise = exercise;
        _sets = sets.ToList();
    }

    public static ExerciseProgress Hydrate(
        TimeProvider timeProvider,
        ExerciseName exercise,
        IEnumerable<Set> sets)
    {
        return new ExerciseProgress(timeProvider, exercise, sets);
    }

    public SetId CompleteSet(SetReps setReps)
    {
        var maxId = _sets.Any()
            ? _sets.Select(set => set.Id.Value).Max()
            : 0;
        var setId = new SetId(maxId + 1);

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var set = new Set(setId, now, setReps.RepGroups);

        _sets.Add(set);

        PublishEvent(new SetCompleted(
            now,
            _exercise,
            setId,
            setReps.RepGroups));

        return setId;
    }

    public void CorrectSet(SetId setId, SetReps setReps)
    {
        var set = _sets.SingleOrDefault(x => x.Id == setId);
        if (set is null)
            throw new DomainValidationException("Set doesn't exist.");

        _sets.Remove(set);
        var newSet = set with
        {
            TimeStamp = _timeProvider.GetUtcNow().UtcDateTime,
            Reps = setReps.RepGroups
        };

        _sets.Add(newSet);

        PublishEvent(
            new SetCorrected(
                _timeProvider.GetUtcNow().UtcDateTime,
                _exercise,
                setId,
                setReps.RepGroups));
    }

    public void RemoveSet(SetId setId)
    {
        if (_sets.RemoveAll(x => x.Id == setId) != 1)
            throw new DomainValidationException("Set doesn't exist.");

        PublishEvent(
            new SetRemoved(
                _timeProvider.GetUtcNow().UtcDateTime,
                _exercise,
                setId));
    }
}
