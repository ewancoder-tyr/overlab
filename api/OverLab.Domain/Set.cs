namespace OverLab.Domain;

public sealed record Set(SetId Id, DateTime TimeStamp, List<RepGroup> Reps);