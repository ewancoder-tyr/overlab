public abstract record DomainEvent(string Type, Type DotNetType, DateTime Timestamp);

public interface IAggregateRoot
{
    IEnumerable<DomainEvent> GetEvents();
    void Commit();
}

public abstract class AggregateRoot : IAggregateRoot
{
    private readonly List<DomainEvent> _events = new();

    protected AggregateRoot(TimeProvider timeProvider)
    {
        TimeProvider = timeProvider;
    }

    protected TimeProvider TimeProvider { get; }
    protected void PublishEvent(DomainEvent @event) => _events.Add(@event);

    IEnumerable<DomainEvent> IAggregateRoot.GetEvents() => _events.AsReadOnly();
    void IAggregateRoot.Commit() => _events.Clear();
}
