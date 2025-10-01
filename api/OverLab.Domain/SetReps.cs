namespace OverLab.Domain;

public sealed record SetReps
{
    public static readonly decimal KgToLbsRatio = 2.20462m;
    private const string KgUnits = "kg";
    private const string LbsUnits = "lbs";
    private const char AlternatingWithLongLengthPartialMarker = '*';
    private const char LongLengthPartialMarker = 'l';

    public SetReps(string value)
    {
        RepGroups = GenerateRepGroups(value).ToList();
    }

    private static IEnumerable<RepGroup> GenerateRepGroups(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new DomainValidationException("Set reps cannot be empty.");

        var parts = value
            .Trim().Split(' ')
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.ToLowerInvariant());

        var weight = 0m;
        foreach (var part in parts)
        {
            if (part.EndsWith(KgUnits))
            {
                if (!decimal.TryParse(part[..^2], out weight))
                    throw new DomainValidationException("Invalid kg weight value.");

                continue;
            }

            if (part.EndsWith(LbsUnits))
            {
                if (!decimal.TryParse(part[..^3], out weight))
                    throw new DomainValidationException("Invalid lbs weight value.");

                // Convert lbs to kg.
                weight = weight / KgToLbsRatio;

                continue;
            }

            if (weight == 0)
                throw new DomainValidationException("Invalid format of rep string: weight was not specified.");

            var repType = RepType.Regular;
            var amount = 0;

            if (part.EndsWith(AlternatingWithLongLengthPartialMarker))
            {
                repType = RepType.AlternatingWithLongLengthPartial;
                amount = int.Parse(part[..^1]);
            }
            else if (part.EndsWith(LongLengthPartialMarker))
            {
                repType = RepType.LongLengthPartial;
                amount = int.Parse(part[..^1]);
            }
            else
            {
                repType = RepType.Regular;
                amount = int.Parse(part);
            }

            yield return new RepGroup(repType, weight, amount);
        }
    }

    public List<RepGroup> RepGroups { get; }
}
