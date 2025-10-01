namespace OverLab.Domain;

public sealed record ExerciseName
{
    public static readonly IEnumerable<string> KnownExercises =
    [
        "bicep curl"
    ];

    public ExerciseName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new DomainValidationException("Exercise name cannot be empty.");

        if (!KnownExercises.Contains(value.ToLowerInvariant()))
            throw new DomainValidationException("Exercise is not a part of known exercises.");

        Value = value;
    }

    public string Value { get; }
}
