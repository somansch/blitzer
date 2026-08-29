"""The two "counts as new for" windows, as entities on the area's own device.

Both are ordinary config-entry settings and live in the entry's options like
every other one. They are surfaced here as well because of where they are
needed: next to the counts they govern, on the page that lists this area's
sensors, rather than four clicks away inside a dialog that reloads the whole
entry when it closes.

Nothing is stored here. Each entity reads the entry it belongs to and writes
back to it, so the options form and the device page are one setting seen from
two places - never two that drift apart.
"""

import logging

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CONF_HAZARD_NEW_MINUTES,
    CONF_NEW_MINUTES,
    DEFAULT_NEW_MINUTES,
    DOMAIN,
)
from .coordinator import BlitzerdeCoordinator

_LOGGER = logging.getLogger(__name__)

# A week, the same ceiling the options form uses. Wide enough for the one case
# that wants a long window - a fixed camera put up on Monday is still worth
# pointing out on Friday - and narrow enough that a slip of the keyboard
# cannot leave everything marked new for a year.
MAX_MINUTES = 10080


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
):
    """Set up this area's two "counts as new for" windows."""
    coordinator: BlitzerdeCoordinator = hass.data[DOMAIN][
        config_entry.entry_id
    ].coordinator

    # One per half, in the order the halves appear everywhere else.
    async_add_entities(
        [
            NewMinutesNumber(coordinator, "new_minutes", CONF_NEW_MINUTES, "mdi:car-clock"),
            NewMinutesNumber(
                coordinator,
                "hazard_new_minutes",
                CONF_HAZARD_NEW_MINUTES,
                "mdi:clock-alert-outline",
            ),
        ]
    )


class NewMinutesNumber(CoordinatorEntity, NumberEntity):
    """How long one half counts a report as new, in minutes.

    A configuration entity rather than a reading: it is what the "new" counts
    on this area's sensors are measured against, and through them what every
    card of this area marks.
    """

    _attr_has_entity_name = True
    _attr_should_poll = False
    # Which is what puts it in the device page's "Configuration" block rather
    # than among the counts, and keeps it out of a dashboard's auto-generated
    # entity lists.
    _attr_entity_category = EntityCategory.CONFIG
    # A box rather than a slider: the useful values are spread over four
    # orders of magnitude - fifteen minutes, an hour, a week - and no slider
    # can offer both ends of that usefully.
    _attr_mode = NumberMode.BOX
    _attr_native_min_value = 0
    _attr_native_max_value = MAX_MINUTES
    _attr_native_step = 1
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES

    def __init__(
        self,
        coordinator: BlitzerdeCoordinator,
        key: str,
        conf_key: str,
        icon: str,
    ) -> None:
        super().__init__(coordinator)
        self._conf_key = conf_key
        self._attr_icon = icon
        # A translation key rather than a literal, the way the count sensors
        # do it, so the name follows the reader's language.
        self._attr_translation_key = key
        self._attr_unique_id = f"{DOMAIN}-{key}-{coordinator.entry_id}"
        self._attr_device_info = coordinator.device_info

    @property
    def available(self) -> bool:
        """Always. Unlike everything else here this is a setting, not a
        reading: whether the last poll of Blitzer.de succeeded says nothing
        about whether the window can be changed.
        """
        return True

    @property
    def native_value(self) -> float:
        """Straight out of the config entry, which is where this lives.

        Read from the entry rather than from a copy kept here, so that a
        change made in the options form shows up without this entity having
        to be told about it.
        """
        return self.coordinator.entry.data.get(self._conf_key, DEFAULT_NEW_MINUTES)

    async def async_set_native_value(self, value: float) -> None:
        """Write the new window back to the entry.

        Which normally reloads the whole entry - see the update listener in
        __init__.py, where a change to nothing but these two is recognised and
        applied without one.
        """
        minutes = int(value)
        entry = self.coordinator.entry
        if minutes == entry.data.get(self._conf_key, DEFAULT_NEW_MINUTES):
            return
        self.hass.config_entries.async_update_entry(
            entry, data={**entry.data, self._conf_key: minutes}
        )
