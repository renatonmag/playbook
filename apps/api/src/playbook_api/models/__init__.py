"""SQLModel tables — the shape of the database, and only that.

Nothing here is a domain type. The domain's `Candle` is the frozen dataclass in
`pattern_engine`; these classes exist so `store/` has something to query.
"""
