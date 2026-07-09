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

from .const import DOMAIN
from .coordinator import BlitzerdeCoordinator

_LOGGER = logging.getLogger(__name__)

SOURCE = DOMAIN


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

        for poi_id in set(known_entities) - current_ids:
            entity = known_entities.pop(poi_id)
            hass.async_create_task(entity.async_remove(force_remove=True))

        # Also purge registry entries left over from a previous HA/integration
        # restart: those were never re-created this session, so the diff above
        # against `known_entities` can't see them.
        for entry in er.async_entries_for_config_entry(
            registry, config_entry.entry_id
        ):
            if (
                entry.domain == "geo_location"
                and entry.unique_id.startswith(unique_prefix)
                and entry.unique_id[len(unique_prefix):] not in current_ids
            ):
                registry.async_remove(entry.entity_id)

        if new_entities:
            async_add_entities(new_entities)

    coordinator.async_add_listener(_sync_entities)
    _sync_entities()


class BlitzerdeLocationEvent(GeolocationEvent):
    """Represents a single Blitzer.de speed camera as a geolocation event."""

    _attr_should_poll = False
    _attr_source = SOURCE

    def __init__(self, coordinator: BlitzerdeCoordinator, poi_id: str, item: dict) -> None:
        self._coordinator = coordinator
        self._poi_id = poi_id
        self._attr_unique_id = f"{DOMAIN}-{coordinator.displayname}-{poi_id}"
        self._attr_unit_of_measurement = UnitOfLength.KILOMETERS
        self._extra_attrs: dict[str, Any] = {}
        self._apply(item)

    @staticmethod
    def _picture_path(item: dict) -> str:
        vmax = item["vmax"]
        if vmax == "?":
            vmax = "v"
        elif vmax == r"\/":
            vmax = "redlight"

        if "fixed" in item["info"]:
            return "fixed_" + vmax
        if "partly_fixed" in item["info"]:
            return "ts_" + vmax
        return "mobile_" + vmax

    def _apply(self, item: dict) -> None:
        self._attr_name = f"Blitzer {self._coordinator.displayname} {item['address']['street']}"
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        self._attr_entity_picture = (
            "https://map.blitzer.de/v5/images/" + self._picture_path(item) + ".svg"
        )
        if self.hass is not None:
            self._attr_distance = self._distance_from_area_center(item["lat"], item["lng"])
        self._extra_attrs = {
            "area": self._coordinator.displayname,
            "backend": item["backend"].split("-")[-1],
            "vmax": item["vmax"],
            "counter": item["counter"],
            "city": item["address"]["city"],
            "street": item["address"]["street"],
            "zip_code": item["address"]["zip_code"],
        }

    def _distance_from_area_center(self, lat: float, lng: float) -> float | None:
        """Return the distance from the configured area's center point, not hass.config.distance()'s home zone."""
        area = self._coordinator.location
        meters = location_util.distance(area["latitude"], area["longitude"], lat, lng)
        if meters is None:
            return None
        return self.hass.config.units.length(meters, UnitOfLength.METERS)

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
