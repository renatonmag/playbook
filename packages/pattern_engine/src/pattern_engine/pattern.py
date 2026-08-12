"""The Pattern contract — a named, reusable rule that reads Series and produces one.

Decided in issue #3. A Pattern is a parameterised class, instantiated by hand in the
pipeline list. Nothing is injected: `__init__` takes parameters, and `run(ctx)` reads what
it needs straight out of `ctx`.
"""

import inspect
import re
from abc import ABC, abstractmethod
from functools import cached_property
from typing import Any

from .series import BaseSeries
from .timeframes import Timeframe

#: The dict that unifies all data for one run. `ctx["bars"]` holds the Candles the engine
#: was handed, keyed by Timeframe; every other key is a producer key holding that Pattern's
#: output Series. Asking for a key it does not have raises — always `ctx[key]`, never
#: `ctx.get(key, empty)`, because "not produced yet" must not collapse into "found nothing".
type Ctx = dict[str, Any]


class Pattern(ABC):
    """Base class for every Pattern.

    A subclass declares its own `__init__` parameters and implements `run`. It never names
    an Instrument: the engine binds the target, the Pattern declares the shape.
    """

    def __new__(cls, *args: Any, **kwargs: Any) -> "Pattern":
        # The producer key is derived from the constructor call rather than declared, so a
        # subclass cannot forget it — and two instances of one class cannot collide on one
        # ctx key, silently overwriting each other.
        instance = super().__new__(cls)
        instance._params = _bound_params(cls, args, kwargs)
        return instance

    _params: dict[str, Any]

    def __init__(self, *, reads: tuple[Timeframe, ...], emits: Timeframe):
        #: The Timeframes whose Candles this Pattern looks at. Carries no minimum bar count:
        #: nothing verifies the Candles handed in are enough.
        self.reads = reads
        #: The single Timeframe the output Series belongs to, and which its Points anchor to.
        self.emits = emits

    @cached_property
    def producer(self) -> str:
        """This instance's key in `ctx` — the class name plus its parameters.

        `Sma(period=20, emits="5m")` is `sma(period=20,emits=5m)`.
        """
        rendered = ",".join(f"{name}={_render(value)}" for name, value in self._params.items())
        return f"{_producer_name(type(self))}({rendered})"

    @abstractmethod
    def run(self, ctx: Ctx) -> BaseSeries:
        """Read from `ctx`, return one Series. The engine writes it under `producer`.

        How the detection is done is the Pattern's own business — a hand-written rule,
        TA-Lib, a trained classifier, an LLM reading the chart. They all pack Points at the
        end, and this contract does not distinguish them.
        """

    def __repr__(self) -> str:
        return f"<{self.producer}>"


def _bound_params(cls: type, args: tuple[Any, ...], kwargs: dict[str, Any]) -> dict[str, Any]:
    """The constructor call as a name -> value dict, in signature order, defaults filled."""
    bound = inspect.signature(cls.__init__).bind_partial(None, *args, **kwargs)
    bound.apply_defaults()
    params: dict[str, Any] = {}
    for name, value in list(bound.arguments.items())[1:]:  # drop `self`
        kind = inspect.signature(cls.__init__).parameters[name].kind
        if kind is inspect.Parameter.VAR_KEYWORD:
            params.update(value)
        elif kind is inspect.Parameter.VAR_POSITIONAL:
            params[name] = tuple(value)
        else:
            params[name] = value
    return params


def _producer_name(cls: type) -> str:
    """`EngulfingPattern` -> `engulfing`, `WedgeConfirmed` -> `wedge-confirmed`."""
    name = cls.__name__
    if name.endswith("Pattern") and name != "Pattern":
        name = name[: -len("Pattern")]
    return re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()


def _render(value: Any) -> str:
    if isinstance(value, (tuple, list)):
        return "|".join(str(v) for v in value)
    return str(value)
