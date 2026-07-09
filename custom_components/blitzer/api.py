from dataclasses import dataclass
from enum import StrEnum
import logging
from random import choice, randrange

from homeassistant.helpers.aiohttp_client import async_get_clientsession
from aiohttp import ClientError, ClientResponseError, ClientSession
from homeassistant.core import HomeAssistant

from .const import (
    TYPE_TRAILER,
    TYPE_MOBILE
)

_LOGGER = logging.getLogger(__name__)

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
            raise APIConnectionError("Failed to request data.")

    async def _requestPois(self, low_lat: float, low_ng: float, high_lat: float, high_lng: float, types):
        """request blitzer list"""
        pois_types = ','.join(map(str, types))
        #z=18 avoids clusters
        url = f"https://cdn2.atudo.net/api/4.0/pois.php?type={pois_types}&box={low_lat},{low_ng},{high_lat},{high_lng}&z=18"
        response_data = await self._requestCatched(url)
        self.connected = True
        return response_data['pois']

    async def _resolveCluster(self, area, radius: float):
        """zoom in to resolve cluster"""
        lat = area['lat']
        lng = area['lng']
        _LOGGER.warn("resolving cluster: " + str([lat, lng, radius]))
        if radius < 1:
            raise Exception("unable to resolve cluster")
        return await self.getArea(lat, lng, radius / 10)

    async def _iterateAreas(self, areas, radius: float):
        """parse areas for pois request"""
        areaList = []
        for area in areas:
            if isCluster(area):
                areaList = areaList + await self._resolveCluster(area, radius)
                continue
            if not areaExists(areaList, area):
                areaList.append(area)
        return areaList

    async def getArea(self, latitude: float, longitude: float, radius: float, types = [TYPE_TRAILER + TYPE_MOBILE]):
        """get map data from api."""
        rad = radius / 100000
        high_lat = latitude + rad
        high_lng = longitude + rad
        low_lat = latitude - rad
        low_ng = longitude - rad
        areas = await self._requestPois(high_lat=high_lat, high_lng=high_lng, low_lat=low_lat, low_ng=low_ng, types=types)
        return await self._iterateAreas(areas, radius)


class APIConnectionError(Exception):
    """Exception class for connection error."""
