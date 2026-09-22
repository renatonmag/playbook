"""Tests for `POST /patterns/custom` — the narrowed run. No database: the session is faked.

What is worth testing here is the narrowing and nothing downstream of it. That a Series crosses the
wire whole, that `time` is seconds, that a raising Pattern is reported rather than hidden — all of
that is `_run`, which this route shares with the two above it and which `test_patterns_route.py`
already covers. Asserting it again here would only prove the two routes call the same function.

So these are about the four claims the route makes on its own: the selection is a **subsequence**
of the declared tuple, a name is refused when it matches nothing, a class part names every instance
of its class, and `edge` decides which rows reach the engine.

Producers are read off `PIPELINE` rather than written out, for the reason the sibling file gives:
retuning a Pattern changes its producer key, and these tests are about the wiring.
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pattern_engine import BaseSeries, Ctx, Pattern, SeriesIdentity
from pattern_engine.patterns import LegExtremesPattern, LegPattern, SimpleLegPattern

from playbook_api.db import get_session
from playbook_api.main import app
from playbook_api.pipeline import PIPELINE
from playbook_api.routers import patterns as patterns_router
from playbook_api.selection import head, select

from test_patterns_route import LAST_OPEN, WINDOW, wave

#: The Pattern this route was built for, and the only one the monitor asks it about.
SIMPLE_LEG = next(
    pattern.producer for pattern in PIPELINE if isinstance(pattern, SimpleLegPattern)
)

#: The first Pattern of the tuple. Named so that a selection can be sent in the *wrong* order and
#: still be asserted to come back in the declared one.
FIRST = PIPELINE[0].producer

#: A class declared twice, and its two keys. Read by class rather than written, so the day the
#: pipeline declares a third the assertion below still says what it means.
LEGS = [pattern.producer for pattern in PIPELINE if isinstance(pattern, LegPattern)]

#: A Pattern whose source is another Pattern — the case a selection can legitimately break.
LEG_EXTREMES = next(
    pattern.producer for pattern in PIPELINE if isinstance(pattern, LegExtremesPattern)
)


@pytest.fixture
def client():
    from test_candles_route import FakeSession

    session = FakeSession(wave())
    app.dependency_overrides[get_session] = lambda: session
    test_client = TestClient(app)
    test_client.session = session  # type: ignore[attr-defined]
    yield test_client
    app.dependency_overrides.clear()


class Spy(Pattern):
    """Records the Candles the run was handed, and produces nothing.

    The same device `test_patterns_route.py` uses, and here for the sharper version of its reason:
    `edge` is a question about which *rows* reached the engine, and asking it through a detector's
    output would answer a different one — a Pattern that ignored the newest bar and a Pattern that
    never saw it look the same from outside.
    """

    seen: list[datetime] = []

    def run(self, ctx: Ctx):
        self.seen = [bar.time for bar in ctx["bars"]["5m"]]
        return BaseSeries(SeriesIdentity(self.producer, ctx["instrument"], self.emits), [])


def post(client: TestClient, **body):
    return client.post("/patterns/custom", params=WINDOW, json=body)


def ran(body: dict) -> list[str]:
    """Every Pattern the selection put in the run, whether or not it produced anything.

    `series` alone would not say it. The narrowing decides what *runs*; whether a run produces a
    Series is ADR-0004's business, and a Pattern selected without its source lands in `failed`
    having been selected perfectly correctly. Asking the two questions through one assertion is
    what confused the first draft of the two tests below.
    """
    return sorted([*body["series"], *body["failed"]])


# --- the narrowing -------------------------------------------------------------------------


def test_one_name_answers_one_series(client):
    body = post(client, patterns=["simple-leg"]).json()

    assert list(body["series"]) == [SIMPLE_LEG]
    assert body["failed"] == []


def test_the_producer_key_is_the_one_the_get_answers_under(client):
    """The whole of what lets a caller supersede one answer with the other.

    A narrowed run makes no Pattern of its own — it keeps the instances `build_pipeline` built — so
    the key cannot move. Asserted against the `GET`'s own response rather than against a constant,
    because a constant would go on agreeing with itself if both drifted.
    """
    narrowed = post(client, patterns=["simple-leg"]).json()
    declared = client.get("/patterns", params=WINDOW).json()

    key = next(iter(narrowed["series"]))
    assert key in declared["series"]
    assert narrowed["series"][key]["identity"] == declared["series"][key]["identity"]
    assert narrowed["series"][key]["name"] == declared["series"][key]["name"]


def test_the_answer_is_in_declaration_order_not_the_callers(client):
    """Run order is the pipeline's, and a list in a body does not get to say otherwise."""
    body = post(client, patterns=["simple-leg", head(FIRST)]).json()

    assert list(body["series"]) == [FIRST, SIMPLE_LEG]


def test_a_class_part_names_every_instance_of_its_class(client):
    """`leg` is declared once per detector, and selecting it means both of them."""
    assert len(LEGS) > 1  # the premise; if the pipeline stops declaring it twice, say so here

    # Read through `ran`, not `series`: `leg` slices a detector's pivots, so neither instance
    # produces anything without its source in the selection. What is under test is which Patterns
    # the *narrowing* picked, and both were picked.
    assert ran(post(client, patterns=["leg"]).json()) == sorted(LEGS)


def test_a_whole_producer_key_names_exactly_one(client):
    """The escape hatch from the line above: a key carries its sources and is unique."""
    assert ran(post(client, patterns=[LEGS[0]]).json()) == [LEGS[0]]


def test_a_repeated_name_selects_the_same_patterns_once(client):
    body = post(client, patterns=["simple-leg", "simple-leg"]).json()

    assert list(body["series"]) == [SIMPLE_LEG]


# --- the refusals --------------------------------------------------------------------------


def test_an_unknown_name_is_refused_rather_than_answered_empty(client):
    """The failure this refusal exists against: a typo answering 200 with an empty `series`.

    Empty already means "these Patterns ran and found nothing", and a response nobody can tell from
    that one is the worst shape this route could take.
    """
    response = post(client, patterns=["nao-existe"])

    assert response.status_code == 400
    assert "nao-existe" in response.json()["detail"]


def test_one_unknown_name_refuses_the_whole_selection(client):
    """All or nothing, like a rule: a partly-read selection is a run nobody asked for."""
    response = post(client, patterns=["simple-leg", "nao-existe"])

    assert response.status_code == 400


def test_an_empty_selection_is_refused(client):
    """`/patterns` is how the whole pipeline is asked for; an empty list here says nothing."""
    assert post(client, patterns=[]).status_code == 422


def test_a_selection_wider_than_the_pipeline_cannot_be_a_narrowing(client):
    response = post(client, patterns=["simple-leg"] * (len(PIPELINE) + 1))

    assert response.status_code == 422


def test_a_pattern_selected_without_its_source_is_reported_not_raised(client):
    """ADR-0004's path, reached by a selection rather than by a mis-written pipeline.

    Nothing declares what a Pattern consumes, so the closure of a selection is not computable and
    this is not refused up front. The engine raises `KeyError`, logs it, writes nothing — and the
    route answers 200 with the name in `failed`, which is the honest report.
    """
    response = post(client, patterns=[LEG_EXTREMES])

    assert response.status_code == 200
    body = response.json()
    assert body["series"] == {}
    assert body["failed"] == [LEG_EXTREMES]


# --- the forming bar -----------------------------------------------------------------------


def test_the_default_withholds_the_bar_at_the_live_edge(client, monkeypatch):
    """Silence means what it means everywhere else on this module: closed bars only.

    The fake answers every query with the same rows, so the window's newest bar and the table's
    newest bar are the one bar — which is the case this is about.
    """
    spy = Spy(reads=("5m",), emits="5m")
    monkeypatch.setattr(patterns_router, "build_pipeline", lambda **_: (spy,))

    post(client, patterns=["spy"])

    assert LAST_OPEN not in spy.seen
    assert spy.seen[-1] == LAST_OPEN - timedelta(minutes=5)


def test_forming_stops_withholding_it(client, monkeypatch):
    spy = Spy(reads=("5m",), emits="5m")
    monkeypatch.setattr(patterns_router, "build_pipeline", lambda **_: (spy,))

    post(client, patterns=["spy"], edge="forming")

    assert spy.seen[-1] == LAST_OPEN


def test_a_third_edge_is_not_a_setting(client):
    assert post(client, patterns=["simple-leg"], edge="live").status_code == 422


def test_the_forming_bar_carries_the_running_leg(client):
    """What the route exists for, read off `simple-leg` rather than off a spy.

    The provisional Point is anchored on the newest bar the run saw, so the two `edge` settings put
    it on two different bars — and the later one is the bar the market has not closed. Every settled
    mark before it is the same mark in both answers: one more bar at the end cannot unmake a turn
    that already happened.
    """
    closed = post(client, patterns=["simple-leg"]).json()["series"][SIMPLE_LEG]["points"]
    forming = post(client, patterns=["simple-leg"], edge="forming").json()["series"][SIMPLE_LEG][
        "points"
    ]

    assert closed[-1]["provisional"] is True
    assert forming[-1]["provisional"] is True
    assert forming[-1]["time"] == int(LAST_OPEN.timestamp())
    assert forming[-1]["time"] > closed[-1]["time"]

    settled = [point for point in closed if not point["provisional"]]
    assert settled == [point for point in forming if not point["provisional"]][: len(settled)]


# --- the narrowing on its own, without a route ---------------------------------------------


def test_select_returns_a_subsequence_of_what_it_was_given():
    """The one property the whole exception rests on, asserted directly.

    Not "the right Patterns" — that is what the route tests above say. This is that the result is a
    *subsequence*: nothing added, nothing reordered, and every survivor the very object the tuple
    held. A `select` that rebuilt equal instances would pass every assertion above and break the
    thing those assertions are standing in for.
    """
    chosen = select(PIPELINE, ["leg", "simple-leg", head(FIRST)])

    positions = [PIPELINE.index(pattern) for pattern in chosen]
    assert positions == sorted(positions)
    assert all(pattern is PIPELINE[index] for pattern, index in zip(chosen, positions))


def test_head_splits_a_producer_key_where_the_browser_splits_it():
    assert head("simple-leg(reads=5m,emits=5m)") == "simple-leg"
    # A key with no parameters at all is still a key, and still its own head.
    assert head("simple-leg") == "simple-leg"
