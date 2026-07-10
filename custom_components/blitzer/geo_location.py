from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.geo_location import GeolocationEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import location as location_util
from homeassistant.util import slugify

from .const import DOMAIN, SEARCH_MODE_ROUTE
from .coordinator import BlitzerdeCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the geolocation platform."""
    coordinator: BlitzerdeCoordinator = hass.data[DOMAIN][
        config_entry.entry_id
    ].coordinator

    registry = er.async_get(hass)
    unique_prefix = f"{DOMAIN}-{coordinator.displayname}-"
    known_entities: dict[str, BlitzerdeLocationEvent] = {}

    @callback
    def _sync_entities() -> None:
        """Add newly reported blitzers and remove ones no longer in range."""
        items = coordinator.data.mapdata[: coordinator.sensorcount]
        current_ids = {item["backend"].split("-")[-1] for item in items}
        new_entities = []

        for item in items:
            poi_id = item["backend"].split("-")[-1]
            if poi_id in known_entities:
                known_entities[poi_id].update_from_item(item)
            else:
                entity = BlitzerdeLocationEvent(coordinator, poi_id, item)
                known_entities[poi_id] = entity
                new_entities.append(entity)

        # Purge every registry entry for this area that no longer matches a
        # currently reported camera - both ones tracked in `known_entities`
        # this session and leftovers from a previous session. Removing the
        # registry entry directly (synchronously, right here) instead of
        # scheduling entity.async_remove() as a separate task is what makes
        # this immediate: it avoids the brief window where the entity's own
        # (async, task-scheduled) teardown hasn't run yet and Home Assistant
        # shows a "restored: true" / unavailable ghost for it in the
        # meantime.
        for entry in list(
            er.async_entries_for_config_entry(registry, config_entry.entry_id)
        ):
            if (
                entry.domain == "geo_location"
                and entry.unique_id.startswith(unique_prefix)
                and entry.unique_id[len(unique_prefix):] not in current_ids
            ):
                known_entities.pop(entry.unique_id[len(unique_prefix):], None)
                registry.async_remove(entry.entity_id)

        if new_entities:
            async_add_entities(new_entities)

    coordinator.async_add_listener(_sync_entities)
    _sync_entities()


class BlitzerdeLocationEvent(GeolocationEvent):
    """Represents a single Blitzer.de speed camera as a geolocation event."""

    _attr_should_poll = False

    def __init__(self, coordinator: BlitzerdeCoordinator, poi_id: str, item: dict) -> None:
        self._coordinator = coordinator
        self._poi_id = poi_id
        # Per-area source (e.g. "blitzer_berlin") instead of a single shared
        # "blitzer" source, so each configured area can be selected on its
        # own via the map card's geo_location_sources option.
        self._attr_source = f"{DOMAIN}_{slugify(coordinator.displayname)}"
        self._attr_unique_id = f"{DOMAIN}-{coordinator.displayname}-{poi_id}"
        self._attr_unit_of_measurement = UnitOfLength.KILOMETERS
        self._extra_attrs: dict[str, Any] = {}
        self._apply(item)

    @staticmethod
    def _base_kind(item: dict) -> str:
        """Physical installation kind, independent of the red-light variant."""
        if "fixed" in item["info"]:
            return "fixed"
        if "partly_fixed" in item["info"]:
            return "trailer"
        return "mobile"

    @classmethod
    def _camera_type(cls, item: dict) -> str:
        """User-facing category: mobile / trailer / fixed / redlight."""
        if item["vmax"] == "/":
            # The API sends this as the JSON-escaped "\/", which the JSON
            # decoder already turns into a plain "/" by the time it gets
            # here. It marks red light cameras, which are always physically
            # "fixed" installations but get their own category since they
            # don't have a speed limit or community confirmation count.
            return "redlight"
        return cls._base_kind(item)

    @classmethod
    def _picture_path(cls, item: dict) -> str:
        vmax = item["vmax"]
        if vmax == "?":
            vmax = "v"
        elif vmax == "/":
            vmax = "redlight"

        kind = cls._base_kind(item)
        prefix = "ts_" if kind == "trailer" else f"{kind}_"
        return prefix + vmax

    def _apply(self, item: dict) -> None:
        self._attr_name = f"Blitzer {self._coordinator.displayname} {item['address']['street']}"
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        self._attr_entity_picture = (
            "https://map.blitzer.de/v5/images/" + self._picture_path(item) + ".svg"
        )
        if self.hass is not None:
            self._attr_distance = self._distance_from_area_center(item["lat"], item["lng"])
        camera_id = item["backend"].split("-")[-1]
        self._extra_attrs = {
            "area": self._coordinator.displayname,
            "type": self._camera_type(item),
            # The id used in the Blitzer.de map URL
            # (https://map.blitzer.de/v5/ID/<id>/) and for the blacklist
            # config option. Kept as "backend" too for compatibility with
            # dashboards/templates written against earlier versions.
            "id": camera_id,
            "backend": camera_id,
            "vmax": item["vmax"],
            "counter": item["counter"],
            "city": item["address"]["city"],
            "street": item["address"]["street"],
            "zip_code": item["address"]["zip_code"],
        }

    def _distance_from_area_center(self, lat: float, lng: float) -> float | None:
        """Return the distance to the nearest configured reference point,
        instead of hass.config.distance()'s home zone: the area's center
        point in area mode, or the closest route waypoint in route mode.
        """
        if self._coordinator.search_mode == SEARCH_MODE_ROUTE:
            reference_points = self._coordinator.waypoints
        else:
            reference_points = [self._coordinator.location]

        distances = [
            meters
            for point in reference_points
            if (meters := location_util.distance(point["latitude"], point["longitude"], lat, lng)) is not None
        ]
        if not distances:
            return None
        return self.hass.config.units.length(min(distances), UnitOfLength.METERS)

    async def async_added_to_hass(self) -> None:
        """Calculate distance once the entity has access to hass.config."""
        self._attr_distance = self._distance_from_area_center(
            self._attr_latitude, self._attr_longitude
        )
        self.async_write_ha_state()

    @callback
    def update_from_item(self, item: dict) -> None:
        """Refresh this entity's state from newly polled data."""
        self._apply(item)
        self.async_write_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        """Purge the registry entry so gone blitzers don't linger as orphans."""
        registry = er.async_get(self.hass)
        if self.entity_id in registry.entities:
            registry.async_remove(self.entity_id)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self._extra_attrs
