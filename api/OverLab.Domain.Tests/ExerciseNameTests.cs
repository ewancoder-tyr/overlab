namespace OverLab.Domain.Tests;

public class ExerciseNameTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("unknown bicep curl")]
    public void ShouldThrow_WhenNameIsUnknown(string? nameValue)
    {
        Assert.Throws<DomainValidationException>(
            () => new ExerciseName(nameValue!));
    }

    [Theory]
    [InlineData("bicep curl")]
    [InlineData("BiCEP cuRL")]
    public void ShouldBeCreated_WhenNameIsCorrect_CaseInsensitively(string nameValue)
    {
        var name = new ExerciseName(nameValue);

        Assert.Equal(nameValue, name.Value);
    }
}
