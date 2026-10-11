"""One button per area: reset its two running counters.

The counters - requests sent to Blitzer.de and reports delivered back, both
on this area's device as sensors (see sensor.py) - only ever go up, so that a
test or a measurement can start from zero this is the one control that
brings them back there. Nothing else is touched: the next poll counts on from
zero as it would have counted on from any other number.
"""

import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import BlitzerdeCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
):
    """Set up this area's counter reset."""
    coordinator: BlitzerdeCoordinator = hass.data[DOMAIN][
        config_entry.entry_id
    ].coordinator
    async_add_entities([ResetCountersButton(coordinator)])


class ResetCountersButton(CoordinatorEntity, ButtonEntity):
    """Brings the request and delivered-report counters back to zero."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    # With the "counts as new for" windows in the device page's
    # Configuration block, not among the readings it resets.
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:counter"
    _attr_translation_key = "reset_counters"

    def __init__(self, coordinator: BlitzerdeCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}-reset_counters-{coordinator.entry_id}"
        self._attr_device_info = coordinator.device_info

    @property
    def available(self) -> bool:
        """Always: resetting a counter does not depend on the last poll
        having succeeded."""
        return True

    async def async_press(self) -> None:
        self.coordinator.reset_counters()
