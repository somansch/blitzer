from dataclasses import dataclass
from datetime import timedelta
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import location as location_util

from .api import BlitzerdeAPI, APIConnectionError
from .const import DOMAIN

from .const import (
    CONF_BLACKLIST,
    CONF_SEARCH_MODE,
    CONF_WAYPOINTS,
    CONF_CORRIDOR_WIDTH,
    SEARCH_MODE_AREA,
    SEARCH_MODE_ROUTE,
    TYPE_TRAILER,
    TYPE_MOBILE,
    TYPE_FIXED
)

_LOGGER = logging.getLogger(__name__)


@dataclass
class BlitzerdeAPIData:
    """Class to hold api data."""

    mapdata: [any]


class BlitzerdeCoordinator(DataUpdateCoordinator):
    """My coordinator."""

    data: BlitzerdeAPIData

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        """Initialize coordinator."""

        # Set variables from values entered in config flow setup
        self.displayname = config_entry.data[CONF_NAME]
        # .get() with a default: entries created before route mode existed
        # only ever know the "area" (radius) search.
        self.search_mode = config_entry.data.get(CONF_SEARCH_MODE, SEARCH_MODE_AREA)
        if self.search_mode == SEARCH_MODE_ROUTE:
            self.location = None
            self.waypoints = config_entry.data[CONF_WAYPOINTS]
            self.corridor_width = config_entry.data[CONF_CORRIDOR_WIDTH]
        else:
            self.location = config_entry.data[CONF_LOCATION]
        # Comma-separated city names, same syntax as the blacklist. Back-compat:
        # entries created before this became a plain city list may still carry
        # the old default regex ".*", which meant "no filter" - keep that
        # meaning instead of matching a literal city named ".*".
        whitelist_raw = config_entry.data.get(CONF_SELECTOR, "")
        if whitelist_raw == ".*":
            whitelist_raw = ""
        self.whitelist = {
            city.strip().lower() for city in whitelist_raw.split(",") if city.strip()
        }
        self.sensorcount = config_entry.data[CONF_COUNT]
        self.types = config_entry.data[CONF_TYPE]
        self.only_confirmed = config_entry.data[CONF_CONDITION]
        # .get() with a default: entries created before the blacklist option
        # existed don't have this key at all.
        blacklist_raw = config_entry.data.get(CONF_BLACKLIST, "")
        self.blacklist = {
            camera_id.strip() for camera_id in blacklist_raw.split(",") if camera_id.strip()
        }

        # Initialise DataUpdateCoordinator
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} ({config_entry.unique_id})",
            # Method to call on every update interval.
            update_method=self.async_update_data,
            # Polling interval. Will only be polled if there are subscribers.
            update_interval=timedelta(seconds=60),
        )

        # Initialise your api here
        self.api = BlitzerdeAPI(hass)

    async def async_update_data(self):
        """Fetch data from API endpoint.

        This is the place to pre-process the data to lookup tables
        so entities can quickly look up their data.
        """
        try:
            want_fixed = self.types['fixed']
            want_redlight = self.types.get('redlight', False)

            types = []
            if self.types['mobile']:
                types = types + TYPE_MOBILE
            if self.types['trailer']:
                types = types + TYPE_TRAILER
            if want_fixed or want_redlight:
                # Red light cameras don't have their own API type code - they
                # come back as regular "fixed" cameras (types 101-117) with
                # vmax == "/". So we still have to request the fixed types
                # whenever either option is on, and tell them apart
                # afterwards using vmax.
                types = types + TYPE_FIXED

            if self.search_mode == SEARCH_MODE_ROUTE:
                mapdata = await self._get_route_mapdata(types)
            else:
                mapdata = await self.api.getArea(latitude=self.location['latitude'], longitude=self.location['longitude'], radius=self.location['radius'], types=types)

            def _keep_fixed_variant(mapitem):
                if 'fixed' not in mapitem['info']:
                    return True
                is_redlight = mapitem['vmax'] == '/'
                return want_redlight if is_redlight else want_fixed

            mapdata = list(filter(_keep_fixed_variant, mapdata))
            if self.whitelist:
                mapdata = list(
                    filter(
                        lambda mapitem: mapitem['address']['city'].strip().lower() in self.whitelist,
                        mapdata
                    )
                )
            if self.blacklist:
                mapdata = list(
                    filter(
                        lambda mapitem: mapitem['backend'].split("-")[-1] not in self.blacklist,
                        mapdata
                    )
                )
            if self.only_confirmed:
                # Fixed cameras have no "confirmed" field at all (they're permanent
                # installations, not community-reported), so treat them as always
                # confirmed instead of dropping them with a KeyError.
                mapdata = list(
                    filter(
                        lambda mapitem: mapitem['info'].get('confirmed', 1) == 1,
                        mapdata
                    )
                )
            return BlitzerdeAPIData(mapdata=mapdata)
        except APIConnectionError as err:
            # This will show entities as unavailable by raising UpdateFailed exception
            raise UpdateFailed(f"Error communicating with API: {err}") from err

    def _route_sample_points(self):
        """Interpolate points along the waypoint chain, spaced corridor_width
        apart, so the circular per-point queries below overlap and leave no
        gaps - a "poor man's route search" without a real routing engine.
        Straight lines between waypoints, not actual roads, so a route with
        sharp bends needs waypoints placed on those bends to stay accurate.
        """
        points = [(self.waypoints[0]['latitude'], self.waypoints[0]['longitude'])]
        for start, end in zip(self.waypoints, self.waypoints[1:]):
            segment_length = location_util.distance(
                start['latitude'], start['longitude'], end['latitude'], end['longitude']
            )
            steps = max(1, int(segment_length // self.corridor_width)) if segment_length else 1
            for step in range(1, steps + 1):
                fraction = step / steps
                points.append((
                    start['latitude'] + (end['latitude'] - start['latitude']) * fraction,
                    start['longitude'] + (end['longitude'] - start['longitude']) * fraction,
                ))
        return points

    async def _get_route_mapdata(self, types):
        """Query a circle of radius corridor_width around every sample point
        along the route and merge the results, deduplicated by camera id.
        """
        mapdata = []
        seen_backends = set()
        for lat, lng in self._route_sample_points():
            for item in await self.api.getArea(latitude=lat, longitude=lng, radius=self.corridor_width, types=types):
                backend = item['backend']
                if backend not in seen_backends:
                    seen_backends.add(backend)
                    mapdata.append(item)
        return mapdata
