"""TomTom: the route between two places as the traffic makes it right now.

The counterpart of ors.py for a "Route (start/destination)" entry that is
kept live. openrouteservice works a route out once, when the entry is set
up, and knows nothing of traffic; TomTom is asked again on every poll, with
the traffic of the moment, and answers with the route that is fastest right
now, its travel time, and how much of that is delay. The Blitzer.de search
then runs along that route (see coordinator._refresh_live_route).

The same methods as ORSClient, raising the same exceptions, so the config
flow walks the same screens with either - only the key and the service
behind it differ. One key covers the three APIs used here: routing,
geocoding and reverse geocoding.

Every request that reaches TomTom is counted, per calendar month: for the
entry it was made for, and in a total across all of them - see TomTomUsage.
"""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import quote

from aiohttp import ClientError

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .ors import (
    ORSAddressNotFound,
    ORSAuthError,
    ORSError,
    ORSLimitExceeded,
    ORSNoRoute,
    ORSParameterError,
    ORSPointNotRoutable,
    ORSQuotaError,
    SIMPLIFY_TOLERANCE_M,
    simplify,
)

_LOGGER = logging.getLogger(__name__)

TOMTOM_BASE_URL = "https://api.tomtom.com"
ROUTING_URL = f"{TOMTOM_BASE_URL}/routing/1/calculateRoute/{{points}}/json"
GEOCODE_URL = f"{TOMTOM_BASE_URL}/search/2/geocode/{{query}}.json"
REVERSE_URL = f"{TOMTOM_BASE_URL}/search/2/reverseGeocode/{{lat}},{{lon}}.json"

# The service takes up to 150 points in one route; a commute's vias are a
# handful.
MAX_POINTS = 150

# What the service's own error codes mean here. The message beside the code
# is free text and changes; the code is what is matched.
_ERRORS = {
    "MAP_MATCHING_FAILURE": ORSPointNotRoutable,
    "NO_ROUTE_FOUND": ORSNoRoute,
    "BAD_INPUT": ORSParameterError,
    "COMPUTE_TIME_LIMIT_EXCEEDED": ORSLimitExceeded,
}


# Where the month's counts are kept, and the signal the counters listen to.
USAGE_STORE_KEY = f"{DOMAIN}.tomtom_usage"
USAGE_STORE_VERSION = 1
SIGNAL_TOMTOM_USAGE = f"{DOMAIN}_tomtom_usage"
_USAGE_DATA_KEY = f"{DOMAIN}_tomtom_usage"


class TomTomUsage:
    """How many requests went to TomTom this calendar month: per entry, and
    all of them together.

    TomTom bills - and caps a free key - by the requests it receives, and
    a live route asks on every poll, so this is the number worth watching.
    Counted is every request that got an answer from TomTom, whatever the
    answer was; one that never reached it is not. The total also holds the
    lookups of a setup that no entry exists for yet. The month is the local
    calendar month; at its turn the counts start at nought and the month
    before is kept beside them, so the last full month can still be read.
    Kept in .storage, so a restart loses nothing.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, USAGE_STORE_VERSION, USAGE_STORE_KEY, atomic_writes=True)
        self._lock = asyncio.Lock()
        self._loaded = False
        self.month = ""
        self.total = 0
        self.entries: dict[str, int] = {}
        self.previous: dict = {"month": "", "total": 0, "entries": {}}

    async def async_load(self) -> None:
        async with self._lock:
            if self._loaded:
                return
            data = await self._store.async_load() or {}
            self.month = str(data.get("month") or "")
            self.total = int(data.get("total") or 0)
            self.entries = {str(k): int(v) for k, v in (data.get("entries") or {}).items()}
            previous = data.get("previous") or {}
            self.previous = {
                "month": str(previous.get("month") or ""),
                "total": int(previous.get("total") or 0),
                "entries": {str(k): int(v) for k, v in (previous.get("entries") or {}).items()},
            }
            self._loaded = True
            self._roll()

    def _roll(self) -> bool:
        """Start a new month if the calendar has moved on; True if it did."""
        month = dt_util.now().strftime("%Y-%m")
        if month == self.month:
            return False
        if self.month:
            self.previous = {"month": self.month, "total": self.total, "entries": dict(self.entries)}
        self.month = month
        self.total = 0
        self.entries = {}
        self._save()
        return True

    def _data(self) -> dict:
        return {
            "month": self.month,
            "total": self.total,
            "entries": self.entries,
            "previous": self.previous,
        }

    def _save(self) -> None:
        self._store.async_delay_save(self._data, 10)

    @callback
    def count(self, entry_id: str | None) -> None:
        self._roll()
        self.total += 1
        if entry_id:
            self.entries[entry_id] = self.entries.get(entry_id, 0) + 1
        self._save()
        async_dispatcher_send(self._hass, SIGNAL_TOMTOM_USAGE)

    @callback
    def for_entry(self, entry_id: str | None) -> int:
        """This month's count - of one entry, or of all of them for None."""
        if self._roll():
            async_dispatcher_send(self._hass, SIGNAL_TOMTOM_USAGE)
        return self.total if entry_id is None else self.entries.get(entry_id, 0)

    @callback
    def previous_for(self, entry_id: str | None) -> tuple[str, int]:
        """The month before and its count - of one entry, or of all of them."""
        month = self.previous.get("month") or ""
        if entry_id is None:
            return month, int(self.previous.get("total") or 0)
        return month, int((self.previous.get("entries") or {}).get(entry_id, 0))

    @callback
    def forget(self, entry_id: str) -> None:
        """An entry that is gone has no count of its own any more; what it
        asked for stays in the total, since TomTom counted it all the same."""
        changed = self.entries.pop(entry_id, None) is not None
        changed = (self.previous.get("entries") or {}).pop(entry_id, None) is not None or changed
        if changed:
            self._save()


async def async_get_usage(hass: HomeAssistant) -> TomTomUsage:
    """The one TomTomUsage of this Home Assistant, loaded."""
    usage = hass.data.get(_USAGE_DATA_KEY)
    if usage is None:
        usage = hass.data[_USAGE_DATA_KEY] = TomTomUsage(hass)
    await usage.async_load()
    return usage


def _error_code(body) -> str:
    """The service's error code, whichever shape the answer came in:
    {"detailedError": {"code": ...}} from routing, {"error": ...} elsewhere."""
    if isinstance(body, dict):
        detailed = body.get("detailedError")
        if isinstance(detailed, dict):
            return str(detailed.get("code") or "")
        error = body.get("error")
        if isinstance(error, dict):
            return str(error.get("code") or "")
    return ""


class TomTomClient:
    def __init__(self, hass: HomeAssistant, api_key: str, entry_id: str | None = None) -> None:
        self._hass = hass
        self._session = async_get_clientsession(hass)
        self._key = api_key or ""
        # Whose request this is, for the month's count - None for a setup
        # that has no entry yet, which only the total counts.
        self._entry_id = entry_id

    async def _call(self, url: str, params: dict):
        if not self._key:
            raise ORSAuthError("no TomTom API key")
        usage = await async_get_usage(self._hass)
        try:
            async with self._session.get(
                url, params={"key": self._key, **params}, timeout=30
            ) as response:
                # Answered, so TomTom has seen it: counted whatever it says.
                usage.count(self._entry_id)
                try:
                    body = await response.json(content_type=None)
                except ValueError:
                    body = None
                status = response.status
        except (ClientError, TimeoutError) as err:
            raise ORSError(f"TomTom could not be reached: {err}") from err

        if status < 400:
            return body
        if status in (401, 403):
            raise ORSAuthError("TomTom refused the API key")
        if status == 429:
            raise ORSQuotaError("TomTom quota used up")
        code = _error_code(body)
        if code in _ERRORS:
            raise _ERRORS[code](f"TomTom: {code}")
        if status == 400:
            raise ORSParameterError(f"TomTom rejected the request: {body}")
        raise ORSError(f"TomTom answered {status}: {body}")

    async def async_check_key(self, latitude: float, longitude: float) -> None:
        """Spend one reverse lookup to find out whether the key works at all -
        and whether it covers the search API, which the addresses need."""
        await self._call(REVERSE_URL.format(lat=latitude, lon=longitude), {})

    async def async_geocode(
        self, text: str, focus: tuple[float, float] | None = None
    ) -> tuple[float, float, str]:
        """The best match for an address: latitude, longitude and its label,
        biased towards the house the way openrouteservice's lookup is."""
        params = {"limit": 1}
        if focus:
            params["lat"] = focus[0]
            params["lon"] = focus[1]
        body = await self._call(GEOCODE_URL.format(query=quote(text, safe="")), params)
        results = (body or {}).get("results") or []
        if not results:
            raise ORSAddressNotFound(text)
        result = results[0]
        position = result.get("position") or {}
        label = (result.get("address") or {}).get("freeformAddress") or text
        return float(position["lat"]), float(position["lon"]), label

    async def async_route(self, points: list[tuple[float, float]]) -> dict:
        """The fastest route through the points right now, in the order given."""
        return (await self.async_routes(points, alternatives=False))[0]

    async def async_routes(
        self, points: list[tuple[float, float]], alternatives: bool = True
    ) -> list[dict]:
        """One route: the one the traffic of the moment makes fastest.

        No alternatives, whatever is asked - a live route is worked out
        again on every poll, and the fastest one then is the one wanted;
        offering a choice at setup would be a choice the next poll undoes.
        Each route carries its points, length and travel time the way
        openrouteservice's do, and beside them what only live traffic can
        say: the delay, and the time it would take without any.
        """
        if len(points) > MAX_POINTS:
            raise ORSLimitExceeded(f"{len(points)} points, TomTom takes {MAX_POINTS}")
        path = ":".join(f"{lat:.6f},{lon:.6f}" for lat, lon in points)
        params = {
            "traffic": "true",
            "travelMode": "car",
            "routeType": "fastest",
            "computeTravelTimeFor": "all",
            "departAt": "now",
            "maxAlternatives": 0,
        }
        body = await self._call(ROUTING_URL.format(points=path), params)
        routes = (body or {}).get("routes") or []
        if not routes:
            raise ORSNoRoute("empty answer")
        out = []
        for route in routes:
            coords = []
            for leg in route.get("legs") or []:
                for point in leg.get("points") or []:
                    coord = (float(point["latitude"]), float(point["longitude"]))
                    # Legs meet on a via point, which both carry.
                    if not coords or coords[-1] != coord:
                        coords.append(coord)
            summary = route.get("summary") or {}
            duration = summary.get("travelTimeInSeconds")
            free = summary.get("noTrafficTravelTimeInSeconds")
            reported = summary.get("trafficDelayInSeconds")
            # The delay is what the way costs beyond a free road: the travel
            # time less the one without traffic. TomTom's own figure counts
            # jams only - measured on Munich to Stuttgart at night, it said
            # nought while roadworks at 27 to 41 km/h put three minutes on
            # the time, and by day 311 s against a difference of 410 - and a
            # driver loses the minutes whatever stands in the road.
            delay = reported
            if duration is not None and free is not None:
                delay = max(int(reported or 0), int(duration) - int(free), 0)
            out.append(
                {
                    "points": simplify(coords, SIMPLIFY_TOLERANCE_M),
                    "distance": summary.get("lengthInMeters"),
                    "duration": duration,
                    "delay": delay,
                    "duration_no_traffic": free,
                }
            )
        return out
