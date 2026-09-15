"""Reads of the Postgres on Supabase.

This is the only layer that knows the database's shape. Uppercase timeframes, column names,
`Decimal` prices — all of it stops here. Nothing in this package raises `HTTPException`: a
store failure is a domain failure, and translating it to a status code is the router's job.
"""
