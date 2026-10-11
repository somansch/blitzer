from dataclasses import dataclass
from enum import StrEnum
import logging
from math import ceil, cos, floor, isfinite, radians
from random import choice, randrange
from time import monotonic

from homeassistant.helpers.aiohttp_client import async_get_clientsession
from aiohttp import ClientError, ClientResponseError, ClientSession, ClientTimeout
from homeassistant.core import HomeAssistant

from .const import (
    TYPE_TRAILER,
    TYPE_MOBILE
)

_LOGGER = logging.getLogger(__name__)

# One degree of latitude, in meters. Constant everywhere; a degree of
# longitude is this times the cosine of the latitude, which is what turns a
# radius in meters into a box that is actually square on the ground.
METERS_PER_DEGREE_LATITUDE = 111320.0

# The host that answers the API. Through v3.3.x this was cdn2.atudo.net, the
# backend the old Blitzer.de map read directly - which blocks an address at
# the TCP level once it has polled too often, the trouble that shaped the
# rate work in this release. The rebuilt blitzer.de map (MapLibre, late 2026)
# no longer touches that CDN: it reads its own domain at
# /karte/api/markers, with the same type/box/z query and the same {pois:...}
# answer, every field included. Pointing here moves the integration onto the
# official public site and off the CDN that was dropping it. Measured
# 2026-10-09: a bare server-side GET (no Referer, no cookie) returns the data,
# identical with or without a Referer.
API_HOST = "www.blitzer.de"

# Without a limit of its own, a server that swallows the connection instead
# of refusing it holds a poll for aiohttp's five minutes.
REQUEST_TIMEOUT = ClientTimeout(total=15)

# The traffic flow the Blitzer.de map colours its roads with, from the same
# site: /karte/api/traffic?box=S,W,N,E&z=<zoom>, one request for one view,
# answered as four parallel arrays - the points of each stretch of road on a
# 2000-step grid over the box, its speed, whether it is a motorway, and its
# carriageway - which the card decodes. Measured 2026-10-11 on a 50 km box
# around Munich: 34 KB and 1072 stretches at z=10, 216 KB at z=12, 637 KB
# at z=14. Nothing here polls it: the card asks for the view it shows while
# it is on screen, and this is what keeps that cheap.
#
# The box is snapped outward to a grid about a kilometre wide, so that a
# small pan asks for the box it already has; what was fetched is kept for a
# short while, so that a second card on the same view, or the same card
# asking again, is answered without a request.
TRAFFIC_GRID = 0.01
TRAFFIC_MAX_SPAN = (2.5, 4.0)
TRAFFIC_CACHE_SECONDS = 90
TRAFFIC_CACHE_SIZE = 8
TRAFFIC_ZOOM = (8, 17)

# The endpoint thins its answer out with the zoom it is asked at: pieces of
# road a few hundred metres long with holes as long between them at z=13,
# whole kilometres missing at z=9. So a view is asked for at up to two zoom
# steps more detail than it shows, as long as the answer stays within a
# budget - measured on a 50 km box (0.32 square degrees): 34 KB at z=10,
# 216 KB at z=12, 637 KB at z=14, about 2.5 times per step.
TRAFFIC_DETAIL_STEPS = 2
TRAFFIC_DETAIL_MAX_ZOOM = 15
TRAFFIC_BUDGET_BYTES = 1_500_000
_TRAFFIC_BYTES_PER_DEG2_AT_12 = 216_000 / 0.315
_TRAFFIC_BYTES_PER_STEP = 2.5


def traffic_detail_zoom(box: tuple, zoom: int) -> int:
    """The zoom to ask the endpoint at for a view shown at `zoom`: as much
    more detail as the budget allows."""
    area = max(1e-6, (box[2] - box[0]) * (box[3] - box[1]))
    best = zoom
    for candidate in range(zoom + 1, min(zoom + TRAFFIC_DETAIL_STEPS, TRAFFIC_DETAIL_MAX_ZOOM) + 1):
        expected = area * _TRAFFIC_BYTES_PER_DEG2_AT_12 * _TRAFFIC_BYTES_PER_STEP ** (candidate - 12)
        if expected > TRAFFIC_BUDGET_BYTES:
            break
        best = candidate
    return best


def traffic_box(south: float, west: float, north: float, east: float):
    """The box to ask the traffic endpoint for, snapped outward to the grid;
    None for a box that is no box, or one too large to be a map view - a
    continent zoomed out to is not worth megabytes of road."""
    edges = (south, west, north, east)
    if not all(isinstance(v, (int, float)) and isfinite(v) for v in edges):
        return None
    if south >= north or west >= east:
        return None
    box = (
        floor(south / TRAFFIC_GRID) * TRAFFIC_GRID,
        floor(west / TRAFFIC_GRID) * TRAFFIC_GRID,
        ceil(north / TRAFFIC_GRID) * TRAFFIC_GRID,
        ceil(east / TRAFFIC_GRID) * TRAFFIC_GRID,
    )
    if box[2] - box[0] > TRAFFIC_MAX_SPAN[0] or box[3] - box[1] > TRAFFIC_MAX_SPAN[1]:
        return None
    return tuple(round(v, 4) for v in box)

def areaExists(areas: list, match_area):
    for area in areas:
        if area['backend'] == match_area['backend']:
            return True
    return False

def isCluster(area):
    # The old CDN marked a cluster with the string type "cluster"; the
    # rebuilt blitzer.de endpoint marks it with a numeric type of 1000 or
    # more instead, well above every real camera or hazard code (the highest
    # is 206). Both are recognised; a hazard type that is a word ("vwd",
    # "closure") is not a number and falls through to False.
    t = area.get('type')
    if t == 'cluster':
        return True
    try:
        return int(t) >= 1000
    except (TypeError, ValueError):
        return False

class BlitzerdeAPI:
    """Class for API."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialise."""
        self._session = async_get_clientsession(hass)
        self.connected: bool = False
        # Requests sent since this instance was made - every single one,
        # cluster resolves included. Read by the area's "Request count"
        # sensor and brought back to zero by its reset button; the sensor
        # restores its last value into it across a restart.
        self.request_count: int = 0
        # Traffic boxes fetched lately: (box, zoom) -> (when, data). See
        # TRAFFIC_CACHE_SECONDS.
        self._traffic_cache: dict = {}

    async def _request(self, url):
        """sends an api request"""
        self.request_count += 1
        async with self._session.get(url=url, timeout=REQUEST_TIMEOUT) as response:
            response.raise_for_status()
            if await response.text() == "":
                raise APIConnectionError("Empty response.")
            return await response.json()

    async def _requestCatched(self, path):
        """sends an api request with handled exceptions"""
        try:
            return await self._request(f"https://{API_HOST}{path}")
        except (ClientError, TimeoutError, ValueError) as err:
            raise APIConnectionError("Failed to request data.") from err

    async def getTraffic(self, box: tuple, zoom: float, force: bool = False):
        """The traffic flow in a box from traffic_box(), as the endpoint sends
        it, with the zoom actually asked and how old the answer is in
        seconds - 0 for one just fetched. None for an answer in a shape
        this does not know."""
        zoom = max(TRAFFIC_ZOOM[0], min(TRAFFIC_ZOOM[1], int(round(zoom))))
        zoom = traffic_detail_zoom(box, zoom)
        key = (box, zoom)
        now = monotonic()
        hit = None if force else self._traffic_cache.get(key)
        if hit and now - hit[0] < TRAFFIC_CACHE_SECONDS:
            return hit[1], zoom, int(now - hit[0])
        path = f"/karte/api/traffic?box={box[0]},{box[1]},{box[2]},{box[3]}&z={zoom}"
        data = await self._requestCatched(path)
        if not (isinstance(data, list) and len(data) == 4):
            data = None
        self._traffic_cache[key] = (now, data)
        while len(self._traffic_cache) > TRAFFIC_CACHE_SIZE:
            oldest = min(self._traffic_cache, key=lambda k: self._traffic_cache[k][0])
            del self._traffic_cache[oldest]
        return data, zoom, 0

    async def _requestPois(self, low_lat: float, low_ng: float, high_lat: float, high_lng: float, types):
        """request blitzer list"""
        pois_types = ','.join(map(str, types))
        # z=18 avoids clusters. "markers" is the rebuilt map's name for what
        # was "pois.php"; the query and the {pois:...} answer are the same.
        path = f"/karte/api/markers?type={pois_types}&box={low_lat},{low_ng},{high_lat},{high_lng}&z=18"
        response_data = await self._requestCatched(path)
        self.connected = True
        # The endpoint answers an empty box with "pois": null rather than an
        # empty list (the old CDN sent []), so a small or quiet search would
        # otherwise hand a None on to _iterateAreas.
        return response_data.get('pois') or []

    async def _resolveCluster(self, area, radius: float, types):
        """zoom in to resolve cluster

        `types` is threaded through rather than left to getArea's default:
        the cluster is being resolved on behalf of a search that asked for a
        particular set of camera types, and re-querying without them both
        ignored that choice and sent a malformed type list, which the API
        answers with fewer cameras rather than an error.
        """
        lat = float(area['lat'])
        lng = float(area['lng'])
        _LOGGER.debug("resolving cluster: %s", [lat, lng, radius])
        if radius < 1:
            raise Exception("unable to resolve cluster")
        return await self.getArea(lat, lng, radius / 10, types)

    async def _iterateAreas(self, areas, radius: float, types):
        """parse areas for pois request"""
        areaList = []
        for area in areas:
            if isCluster(area):
                areaList = areaList + await self._resolveCluster(area, radius, types)
                continue
            area['lat'] = float(area['lat'])
            area['lng'] = float(area['lng'])
            if not areaExists(areaList, area):
                areaList.append(area)
        return areaList

    async def getArea(self, latitude: float, longitude: float, radius: float, types=None):
        """get map data from api.

        The default used to read [TYPE_TRAILER + TYPE_MOBILE], which nests a
        list inside a list - joined into the URL that becomes the literal
        text "['ts', 0, 1, ...]" instead of "ts,0,1,...". The API answers it
        with 200 and a shorter list rather than an error, so the loss was
        silent. Built here instead of in the signature, which also keeps a
        mutable default from being shared between calls.
        """
        if types is None:
            types = TYPE_TRAILER + TYPE_MOBILE
        # The radius arrives in meters (Home Assistant's location selector)
        # and has to become a degree offset per axis. It used to be
        # radius / 100000 for both, which is wrong twice over: a degree of
        # latitude is 111320m rather than 100000m, and a degree of longitude
        # is shorter still - by the cosine of the latitude. The searched box
        # therefore came out 11% too tall and, at German latitudes, 24-35%
        # too narrow, so cameras due east or west of the center sat inside
        # the circle drawn on the map but outside the query. Nothing filters
        # by distance afterwards, so those were simply missing.
        #
        # The cosine is floored so a point near a pole cannot divide by
        # something arbitrarily close to zero; there is nothing to find at
        # 89 degrees anyway, and an enormous box would be the worse answer.
        lat_delta = radius / METERS_PER_DEGREE_LATITUDE
        lng_delta = radius / (METERS_PER_DEGREE_LATITUDE * max(cos(radians(latitude)), 0.01))
        high_lat = latitude + lat_delta
        high_lng = longitude + lng_delta
        low_lat = latitude - lat_delta
        low_ng = longitude - lng_delta
        areas = await self._requestPois(high_lat=high_lat, high_lng=high_lng, low_lat=low_lat, low_ng=low_ng, types=types)
        return await self._iterateAreas(areas, radius, types)


class APIConnectionError(Exception):
    """Exception class for connection error."""
