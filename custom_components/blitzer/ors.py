"""openrouteservice: the route between two places, and the places themselves.

Used only while a "Route (start/destination)" entry is set up or edited. The
route is worked out once and stored with the entry; polling Blitzer.de along
it afterwards costs openrouteservice nothing.

The API lives at api.heigit.org since api.openrouteservice.org was switched
off on 2026-08-24 - same keys, the service name now part of the path. Both
services take the key in the Authorization header: without one they answer
401, with a wrong one 403, measured against the live gateway.
"""

from __future__ import annotations

from math import atan2, cos, degrees, radians, sin
import logging

from aiohttp import ClientError

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

ORS_BASE_URL = "https://api.heigit.org"
DIRECTIONS_URL = f"{ORS_BASE_URL}/openrouteservice/v2/directions/driving-car/geojson"
GEOCODE_URL = f"{ORS_BASE_URL}/pelias/v1/search"
REVERSE_URL = f"{ORS_BASE_URL}/pelias/v1/reverse"

# How far a point of the stored route may move when it is thinned out. A
# route comes back with a vertex every few metres - 715 of them for 23 km
# through Munich - while the search around it is a corridor of hundreds of
# metres. At 10 m the same route keeps 86 points and loses nothing the
# corridor could notice.
SIMPLIFY_TOLERANCE_M = 10

_METERS_PER_DEGREE = 111320.0

# How wide a corridor a route of a given length is searched in. A route is
# searched circle by circle, one Blitzer.de request per circle, spaced as far
# apart as the corridor is wide - and that for every half that polls, on
# every poll. At a fixed 300 m a 24 km commute is 80 requests per half a
# minute apart, and 200 km would be 670. So the width follows the length,
# aiming at about CORRIDOR_SAMPLES circles: a short route keeps a narrow
# corridor that stays on its road, a long one is still covered end to end
# without the request count growing with every kilometre. Past 200 km the
# upper bound takes over, and the count grows again, but slowly.
# How far the road a via point snaps to may turn away from the direction the
# route is travelling there. Without it, a via point dropped on a motorway can
# snap to the carriageway running the other way - and the only way onto that
# is to drive on past, turn at the next junction and come back, which on the
# map is a stretch of road driven twice, out and back. 100 degrees either side
# is just over half the compass: a two-way road always has one direction
# inside it, a one-way carriageway only when it does not run backwards.
VIA_BEARING_DEVIATION = 100

# How many routes openrouteservice is asked for between a start and a
# destination, and how much longer and how different one may be to count.
# Only ever without via points - the service offers no alternatives once
# the way is pinned down - and the fastest way is always the first.
ALTERNATIVE_ROUTES = 3
ALTERNATIVE_WEIGHT_FACTOR = 1.6
ALTERNATIVE_SHARE_FACTOR = 0.6

CORRIDOR_SAMPLES = 40
MIN_CORRIDOR_M = 300
MAX_CORRIDOR_M = 5000


# The key saved for further routes, when that was asked for. Kept in a store
# of its own rather than copied into every route entry: typed once, it is not
# asked for again, and changed once, it changes for every route using it.
# Private, so only Home Assistant can read the file - it is a credential.
_STORE_KEY = f"{DOMAIN}.openrouteservice"
_STORE_VERSION = 1
_STORE_DATA = f"{DOMAIN}_ors_store"


class ORSError(Exception):
    """Anything openrouteservice said no to, or did not say at all."""


class ORSAuthError(ORSError):
    """The key is missing, wrong, or not allowed to use this API."""


class ORSQuotaError(ORSError):
    """The key's quota is used up for now."""


class ORSAddressNotFound(ORSError):
    """The geocoder found nothing for the text given."""


class ORSPointNotRoutable(ORSError):
    """A start, destination or via point is nowhere near a road."""


class ORSNoRoute(ORSError):
    """The points are on roads, but no road connects them."""


class ORSLimitExceeded(ORSError):
    """Too long a route, or too many points for one request."""


class ORSParameterError(ORSError):
    """openrouteservice did not accept a parameter of the request."""


def _error_code(body) -> int | None:
    """The numeric code out of a routing error, whichever shape it came in.

    The routing service answers {"error": {"code": 2010, ...}}; the gateway
    in front of it answers {"error": "Access to this API has been disallowed"}.
    """
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            try:
                return int(error.get("code"))
            except (TypeError, ValueError):
                return None
    return None


class ORSClient:
    """The three calls this integration makes, and nothing else."""

    def __init__(self, hass: HomeAssistant, api_key: str) -> None:
        self._session = async_get_clientsession(hass)
        self._headers = {
            "Authorization": api_key or "",
            "Accept": "application/json, application/geo+json",
        }

    async def _call(self, method: str, url: str, **kwargs):
        if not self._headers["Authorization"]:
            # No key at all - the saved one was removed, say. Answered the
            # way a refused key is, which sends the flow back to ask for one.
            raise ORSAuthError("no openrouteservice API key")
        try:
            async with self._session.request(
                method, url, headers=self._headers, timeout=30, **kwargs
            ) as response:
                try:
                    body = await response.json(content_type=None)
                except ValueError:
                    body = None
                status = response.status
        except (ClientError, TimeoutError) as err:
            raise ORSError(f"openrouteservice could not be reached: {err}") from err

        if status < 400:
            return body
        if status in (401, 403):
            raise ORSAuthError("openrouteservice refused the API key")
        if status == 429:
            raise ORSQuotaError("openrouteservice quota used up")
        code = _error_code(body)
        if code == 2010:
            raise ORSPointNotRoutable("a point is not near a road")
        if code == 2009:
            raise ORSNoRoute("no route between the points")
        if code in (2004, 2017) or status == 413:
            raise ORSLimitExceeded("route or request exceeds openrouteservice's limits")
        if status == 400:
            raise ORSParameterError(f"openrouteservice rejected the request: {body}")
        raise ORSError(f"openrouteservice answered {status}: {body}")

    async def async_check_key(self, latitude: float, longitude: float) -> None:
        """Spend one reverse lookup to find out whether the key works at all.

        Asked where the house is, because that point always exists; what
        comes back does not matter, only whether an error does.
        """
        await self._call(
            "GET",
            REVERSE_URL,
            params={"point.lat": latitude, "point.lon": longitude, "size": 1},
        )

    async def async_geocode(
        self, text: str, focus: tuple[float, float] | None = None
    ) -> tuple[float, float, str]:
        """The best match for an address: latitude, longitude and its label.

        Biased towards the house rather than restricted to a country:
        Blitzer.de reports well beyond Germany, and "Hauptstraße 1" is best
        answered with the nearest one.
        """
        params = {"text": text, "size": 1}
        if focus:
            params["focus.point.lat"] = focus[0]
            params["focus.point.lon"] = focus[1]
        body = await self._call("GET", GEOCODE_URL, params=params)
        features = (body or {}).get("features") or []
        if not features:
            raise ORSAddressNotFound(text)
        feature = features[0]
        lon, lat = feature["geometry"]["coordinates"][:2]
        label = (feature.get("properties") or {}).get("label") or text
        return float(lat), float(lon), label

    async def async_route(self, points: list[tuple[float, float]]) -> dict:
        """The driving route through the points, in the order given."""
        return (await self.async_routes(points, alternatives=False))[0]

    async def async_routes(
        self, points: list[tuple[float, float]], alternatives: bool = True
    ) -> list[dict]:
        """The driving route through the points, in the order given - and,
        between a start and a destination alone, up to two alternatives
        after it, fastest first.

        Only the fields whose names are beyond doubt are sent. The public
        docs and the service's own source disagree on what the optional
        simplification and snapping radii are called, and an unknown field
        is an error rather than being ignored - so the route is thinned out
        here instead.
        """
        request = {
            "coordinates": [[lon, lat] for lat, lon in points],
            "instructions": False,
        }
        if alternatives and len(points) == 2:
            request["alternative_routes"] = {
                "target_count": ALTERNATIVE_ROUTES,
                "weight_factor": ALTERNATIVE_WEIGHT_FACTOR,
                "share_factor": ALTERNATIVE_SHARE_FACTOR,
            }
        if len(points) > 2:
            # Each via point is told which way the route is going through it:
            # from the point before it towards the point after it. Start and
            # destination get none - their first and last road can
            # legitimately point anywhere.
            request["bearings"] = [
                [],
                *[
                    [round(_bearing(points[i - 1], points[i + 1])), VIA_BEARING_DEVIATION]
                    for i in range(1, len(points) - 1)
                ],
                [],
            ]
        try:
            body = await self._call("POST", DIRECTIONS_URL, json=request)
        except ORSParameterError:
            if "bearings" not in request and "alternative_routes" not in request:
                raise
            # A route without the extras still beats no route. Said in the
            # log, because a route that turns back on itself is then possible
            # again and this is where the reason can be found.
            _LOGGER.warning(
                "openrouteservice did not accept the %s; working out the route without",
                "via point directions" if "bearings" in request else "request for alternatives",
            )
            request.pop("bearings", None)
            request.pop("alternative_routes", None)
            body = await self._call("POST", DIRECTIONS_URL, json=request)
        features = (body or {}).get("features") or []
        if not features:
            raise ORSNoRoute("empty answer")
        routes = []
        for feature in features:
            coords = [
                (float(lat), float(lon)) for lon, lat, *_ in feature["geometry"]["coordinates"]
            ]
            summary = (feature.get("properties") or {}).get("summary") or {}
            routes.append(
                {
                    "points": simplify(coords, SIMPLIFY_TOLERANCE_M),
                    "distance": summary.get("distance"),
                    "duration": summary.get("duration"),
                }
            )
        return routes


def _store(hass: HomeAssistant) -> Store:
    """One Store instance for the key, so two flows cannot write past each other."""
    store = hass.data.get(_STORE_DATA)
    if store is None:
        store = hass.data[_STORE_DATA] = Store(
            hass, _STORE_VERSION, _STORE_KEY, private=True, atomic_writes=True
        )
    return store


async def async_load_saved_key(hass: HomeAssistant) -> str | None:
    """The key saved for further routes, if one was."""
    data = await _store(hass).async_load()
    return (data or {}).get("api_key") or None


async def async_save_key(hass: HomeAssistant, api_key: str) -> None:
    await _store(hass).async_save({"api_key": api_key})


async def async_forget_key(hass: HomeAssistant) -> None:
    await _store(hass).async_remove()
    hass.data.pop(_STORE_DATA, None)


def _bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    """The initial compass bearing from a to b, 0-360 clockwise from north."""
    lat1, lon1, lat2, lon2 = map(radians, (a[0], a[1], b[0], b[1]))
    dlon = lon2 - lon1
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    return (degrees(atan2(x, y)) + 360) % 360


def corridor_width_for(distance_m) -> int:
    """The corridor width for a route this many metres long, in whole 50 m."""
    if not distance_m:
        return MIN_CORRIDOR_M
    width = max(MIN_CORRIDOR_M, min(MAX_CORRIDOR_M, float(distance_m) / CORRIDOR_SAMPLES))
    return int(round(width / 50) * 50)


def simplify(points: list[tuple[float, float]], tolerance_m: float) -> list[tuple[float, float]]:
    """Douglas-Peucker, in metres, without recursion.

    Iterative because a long route is thousands of points, and the recursive
    form is one Python frame per split. The projection is flat - metres per
    degree of longitude taken at the route's mean latitude - which is exact
    enough for a tolerance of metres over a route of kilometres.
    """
    if len(points) < 3:
        return list(points)
    k = cos(radians(sum(p[0] for p in points) / len(points)))

    def xy(p):
        return (p[1] * _METERS_PER_DEGREE * k, p[0] * _METERS_PER_DEGREE)

    projected = [xy(p) for p in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = projected[first]
        bx, by = projected[last]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        worst, index = 0.0, 0
        for i in range(first + 1, last):
            px, py = projected[i]
            t = ((px - ax) * dx + (py - ay) * dy) / length2 if length2 else 0.0
            t = max(0.0, min(1.0, t))
            dist = ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
            if dist > worst:
                worst, index = dist, i
        if worst > tolerance_m:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, kept in zip(points, keep) if kept]
