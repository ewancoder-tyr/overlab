namespace OverLab.Domain.Tests;

public class SetRepsTests
{
    [Fact]
    public void ShouldHaveCorrectKgToLbsRatio()
    {
        Assert.Equal(2.20462m, SetReps.KgToLbsRatio);
    }

    [Fact]
    public void ShouldBeCreated_WhenSimpleSet()
    {
        var input = "20kg 8";
        var setReps = new SetReps(input);

        var repGroups = setReps.RepGroups;
        Assert.Equal(1, repGroups.Count);

        var firstSet =  repGroups[0];
        Assert.Equal(20m, firstSet.Weight);
        Assert.Equal(8, firstSet.Amount);
    }

    [Fact]
    public void ShouldThrow_WhenSimpleSet_WithoutWeightUnits()
    {
        var input = "20 8";

        Assert.Throws<DomainValidationException>(
            () => new SetReps(input));
    }

    [Fact]
    public void ShouldBeCreated_WhenComplexSet()
    {
        var input = "   20kg 8*   4 5l 2    22.5kg 4* 8L 5   ";
        var setReps = new SetReps(input);

        var repGroups = setReps.RepGroups;
        Assert.Equal(7, repGroups.Count);

        Assert.Equal(20m, repGroups[0].Weight);
        Assert.Equal(8, repGroups[0].Amount);
        Assert.Equal(RepType.AlternatingWithLongLengthPartial,  repGroups[0].Type);

        Assert.Equal(20m, repGroups[1].Weight);
        Assert.Equal(4, repGroups[1].Amount);
        Assert.Equal(RepType.Regular,  repGroups[1].Type);

        Assert.Equal(20m, repGroups[2].Weight);
        Assert.Equal(5, repGroups[2].Amount);
        Assert.Equal(RepType.LongLengthPartial,  repGroups[2].Type);

        Assert.Equal(20m, repGroups[3].Weight);
        Assert.Equal(2, repGroups[3].Amount);
        Assert.Equal(RepType.Regular,  repGroups[3].Type);

        Assert.Equal(22.5m, repGroups[4].Weight);
        Assert.Equal(4, repGroups[4].Amount);
        Assert.Equal(RepType.AlternatingWithLongLengthPartial,  repGroups[4].Type);

        Assert.Equal(22.5m, repGroups[5].Weight);
        Assert.Equal(8, repGroups[5].Amount);
        Assert.Equal(RepType.LongLengthPartial,  repGroups[5].Type);

        Assert.Equal(22.5m, repGroups[6].Weight);
        Assert.Equal(5, repGroups[6].Amount);
        Assert.Equal(RepType.Regular,  repGroups[6].Type);
    }

    [Fact]
    public void ShouldSupportLbsUnits()
    {
        var input = "7.5lbs 8";
        var setReps = new SetReps(input);

        var repGroups = setReps.RepGroups;
        Assert.Equal(1, repGroups.Count);

        var firstSet =  repGroups[0];
        Assert.Equal(7.5m / SetReps.KgToLbsRatio, firstSet.Weight);
        Assert.Equal(8, firstSet.Amount);
    }

    [Theory]
    [InlineData("0kg 30 20")]
    [InlineData("12 30 20")]
    [InlineData("1hkg 30 20")]
    [InlineData("3_lbs 30 20")]
    public void ShouldThrow_WhenInvalidWeightSpecified(string input)
    {
        Assert.Throws<DomainValidationException>(() => new SetReps(input));
    }

    [Fact]
    public void ShouldThrow_WhenEmptyInput()
    {
        Assert.Throws<DomainValidationException>(() => new SetReps(""));
        Assert.Throws<DomainValidationException>(() => new SetReps("   "));
    }

    // This test is based on real-world data that caused issues for the application.
    [Theory]
    [InlineData("20kg 30 20")]
    public void ShouldWork_WithCustomData(string input)
    {
        var sut = new SetReps(input);
        Assert.NotNull(sut);
    }
}
