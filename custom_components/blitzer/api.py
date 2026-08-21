from dataclasses import dataclass
from enum import StrEnum
import logging
from math import cos, radians
from random import choice, randrange

from homeassistant.helpers.aiohttp_client import async_get_clientsession
from aiohttp import ClientError, ClientResponseError, ClientSession
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

def areaExists(areas: list, match_area):
    for area in areas:
        if area['backend'] == match_area['backend']:
            return True
    return False

def isCluster(area):
    return area['type'] == 'cluster'

class BlitzerdeAPI:
    """Class for API."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialise."""
        self._session = async_get_clientsession(hass)
        self.connected: bool = False

    async def _request(self, url):
        """sends an api request"""
        async with self._session.get(url=url) as response:
            response.raise_for_status()
            if await response.text() == "":
                raise APIConnectionError("Empty response.")
            return await response.json()

    async def _requestCatched(self, url):
        """sends an api request with handled exceptions"""
        try:
            return await self._request(url)
        except ClientError as err:
            raise APIConnectionError("Failed to request data.") from err

    async def _requestPois(self, low_lat: float, low_ng: float, high_lat: float, high_lng: float, types):
        """request blitzer list"""
        pois_types = ','.join(map(str, types))
        #z=18 avoids clusters
        url = f"https://cdn2.atudo.net/api/4.0/pois.php?type={pois_types}&box={low_lat},{low_ng},{high_lat},{high_lng}&z=18"
        response_data = await self._requestCatched(url)
        self.connected = True
        return response_data['pois']

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
