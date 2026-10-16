from knowledgebase import patterns


def test_pattern_registry_nonempty_and_described():
    assert len(patterns.REGISTRY) > 0
    meta = patterns.describe()
    assert isinstance(meta, dict)
    # Every registered pattern should have a description
    for name in patterns.REGISTRY:
        assert name in meta, f"pattern '{name}' missing from describe()"


def test_empty_bars_no_patterns():
    result = patterns.scan([])
    assert result == []


def test_single_bar_no_patterns():
    from knowledgebase.patterns import Bar
    bars = [Bar(time=0, open=1.0, high=1.1, low=0.9, close=1.0)]
    result = patterns.scan(bars)
    assert result == []


def test_describe_covers_all_patterns():
    """Every pattern in REGISTRY should have a non-empty description."""
    meta = patterns.describe()
    for name in patterns.REGISTRY:
        assert meta.get(name), f"pattern '{name}' has no description"
