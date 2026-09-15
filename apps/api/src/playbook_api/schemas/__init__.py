"""What the API puts on the wire.

A schema here is the contract with the browser, kept separate from both the table in `models/`
(whose columns must not leak) and the domain types in `pattern_engine` (whose serialization
also serves the LLM, which wants readable timestamps rather than integers).
"""
