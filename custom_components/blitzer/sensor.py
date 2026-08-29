import logging
from datetime import timedelta

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .coordinator import BlitzerdeCoordinator

_LOGGER = logging.getLogger(__name__)


def _minutes_since(stamp, now):
    """How old a Blitzer.de timestamp is, in minutes, or None.

    Blitzer.de dates a report the way its own map shows it: a bare "HH:MM"
    while it is from today, and "DD.MM.YYYY" once it is not. Neither is a
    machine format, so both are read here the same way the card reads them -
    a time still ahead of the clock belongs to yesterday, because the poll
    can be a minute behind the server that stamped it.
    """
    if not isinstance(stamp, str):
        return None
    text = stamp.strip()
    try:
        if ":" in text:
            hour, minute = (int(part) for part in text.split(":", 1))
            then = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if then > now:
                then = then - timedelta(days=1)
        else:
            day, month, year = (int(part) for part in text.split(".", 2))
            then = now.replace(
                year=year, month=month, day=day,
                hour=0, minute=0, second=0, microsecond=0,
            )
    except (TypeError, ValueError):
        return None
    return max(0, int((now - then).total_seconds() // 60))


def _count_new(items, minutes, now) -> int:
    """How many of these were reported inside the window.

    Counted across everything in range, the way the per-city breakdown is -
    not the capped slice the state reports. A report Blitzer.de dated in a
    way neither format covers is not counted: "no date" is not the same
    thing as "just now".
    """
    fresh = 0
    for item in items:
        age = _minutes_since(item.get("create_date"), now)
        if age is not None and age < minutes:
            fresh = fresh + 1
    return fresh


def _iso(stamp):
    """A "last update" attribute: ISO-8601 local time, or None.

    None while that kind has never completed a fetch - a manual-only entry
    before its first refresh action, for instance. Reported as text rather
    than a datetime so what a template reads is the same thing the states
    page shows.
    """
    return stamp.isoformat() if stamp else None


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
):
    """Set up the Sensors."""
    # This gets the data update coordinator from hass.data as specified in your __init__.py
    coordinator: BlitzerdeCoordinator = hass.data[DOMAIN][
        config_entry.entry_id
    ].coordinator

    # One count per kind, mirroring the two sets of geo_location entities,
    # plus their sum - which is also the one place both "last update"
    # moments can be read side by side.
    sensors = [
        SensorMapTotal(coordinator),
        SensorHazardTotal(coordinator),
        SensorGrandTotal(coordinator),
    ]

    # Create the sensors.
    async_add_entities(sensors)


class SensorTotalBase(CoordinatorEntity):
    """Shared plumbing for the count sensors: redrawing on every coordinator
    update, and the attribute block all of them carry.
    """

    _attr_should_poll = False
    _attr_has_entity_name = True

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()

    def _timestamps(self) -> dict:
        """The "last update" attributes this sensor reports."""
        raise NotImplementedError

    def _breakdown(self) -> dict:
        """Per-city counts, for the sensors that break their count down."""
        return {}

    def _extra(self) -> dict:
        """Anything a particular sensor reports beyond the shared block."""
        return {}

    @property
    def extra_state_attributes(self):
        attrs = {}
        attrs["state_class"] = SensorStateClass.MEASUREMENT
        attrs.update(self._timestamps())
        attrs.update(self._breakdown())
        attrs.update(self._extra())

        return attrs


class SensorKindTotal(SensorTotalBase):
    """How many of one kind this area currently reports, capped the same way
    that kind's entities are, plus a per-city breakdown.
    """

    def _items(self):
        """The polled items this sensor counts."""
        raise NotImplementedError

    @property
    def _cap(self) -> int:
        """The configured maximum, the same one that caps the entities."""
        raise NotImplementedError

    def _city(self, item) -> str:
        """The city an item is attributed to in the breakdown."""
        raise NotImplementedError

    @property
    def state(self):
        item_count = len(self._items())
        if item_count > self._cap:
            return self._cap
        return item_count

    @property
    def _window(self) -> int:
        """This half's "counts as new for" window, in minutes."""
        raise NotImplementedError

    def _extra(self) -> dict:
        """How many of this half are still new, and the window deciding it.

        The window is reported whether or not it is switched on, because it
        is a setting and always says something; the count is left out at 0,
        where it could only ever be a zero pretending to be an answer. The
        card reads both back rather than deciding for itself, so that every
        card of an area marks the same reports as new.
        """
        minutes = self._window
        attrs = {"new_minutes": minutes}
        if minutes:
            attrs["new"] = _count_new(self._items(), minutes, dt_util.now())
        return attrs

    def _breakdown(self) -> dict:
        counts = {}
        for item in self._items():
            # Counted across everything in range, not just the capped slice
            # the state reports - so these can add up to more than the state
            # when there are more hits than the configured maximum.
            name = self._city(item)
            if not name:
                continue
            if name in counts:
                counts[name] = counts[name] + 1
            else:
                counts[name] = 1
        return counts


class SensorMapTotal(SensorKindTotal):

    _attr_icon = "mdi:car"

    def __init__(self, coordinator: BlitzerdeCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = coordinator.device_info
        # _attr_*, not self.name/self.unique_id: those are cached_property on
        # Entity, so assigning to them happens to work today but is not the
        # documented way and would break the day they go back to being plain
        # properties.
        #
        # The unique id stays what it always was, even though the name has
        # changed twice now - "Anzahl", then "Anzahl Blitzer", now "Anzahl
        # Kontrollen": changing it would hand every existing installation a
        # new entity id and quietly break the dashboards and automations
        # pointing at the old one.
        #
        # "Kontrollen" rather than "Blitzer" because that is what this
        # counts: by Blitzer.de's own wording, 14 of the 28 codes on this
        # side are a "...kontrolle" and only 9 a "...blitzer".
        #
        # A translation key rather than a literal, so the name follows the
        # reader's language instead of being German for everyone. The entity
        # id is unaffected: it was generated once, at registration.
        self._attr_translation_key = "control_count"
        self._attr_unique_id = f"{DOMAIN}-control-{self.coordinator.entry_id}-total"

    def _items(self):
        return self.coordinator.data.controls

    @property
    def _cap(self) -> int:
        return self.coordinator.controlcount

    @property
    def _window(self) -> int:
        return self.coordinator.new_minutes

    def _city(self, item) -> str:
        return item['address']['city']

    def _timestamps(self) -> dict:
        return {"last_update": _iso(self.coordinator.last_update["controls"])}


class SensorHazardTotal(SensorKindTotal):

    _attr_icon = "mdi:alert"

    def __init__(self, coordinator: BlitzerdeCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = coordinator.device_info
        # "hazard" before the display name, matching the hazard entities'
        # unique ids in geo_location.py - "blitzer-<name>-total" is already
        # taken by the camera count.
        self._attr_translation_key = "hazard_count"
        self._attr_unique_id = f"{DOMAIN}-hazard-{self.coordinator.entry_id}-total"

    def _items(self):
        return self.coordinator.data.hazards

    @property
    def _cap(self) -> int:
        return self.coordinator.hazardcount

    @property
    def _window(self) -> int:
        return self.coordinator.hazard_new_minutes

    def _city(self, item) -> str:
        # Unlike a camera, a hazard is not guaranteed to have an address at
        # all: a traffic control centre report sometimes carries only the
        # road. Those are left out of the breakdown rather than counted
        # under an empty attribute name.
        return (item.get('address') or {}).get('city', '')

    def _timestamps(self) -> dict:
        return {"last_update": _iso(self.coordinator.last_update["hazards"])}


class SensorGrandTotal(SensorTotalBase):
    """Both counts added together, and the one entity that carries both
    "last update" moments - which differ, since cameras and hazards poll on
    intervals of their own.
    """

    _attr_icon = "mdi:counter"

    def __init__(self, coordinator: BlitzerdeCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = coordinator.device_info
        self._attr_translation_key = "total_count"
        self._attr_unique_id = f"{DOMAIN}-combined-{self.coordinator.entry_id}-total"

    @property
    def state(self):
        # The sum of what the other two report, so the three always add up -
        # both halves capped at their own configured maximum, rather than
        # counting everything in range and disagreeing with them.
        data = self.coordinator.data
        controls = min(len(data.controls), self.coordinator.controlcount)
        hazards = min(len(data.hazards), self.coordinator.hazardcount)
        return controls + hazards

    def _extra(self) -> dict:
        """How many of this area's reports are still new, and the two windows
        that decide it.

        One number for the whole area, so that a dashboard's visibility
        condition, an automation and a template all agree on what "new"
        means - which a card computing it for itself cannot give them. Each
        half is measured against its own window, so a card can still be
        marking a camera from this morning once the tailback from half an
        hour ago has stopped counting.

        Both windows are reported even when a half is switched off: this is
        the entity a card reads them from, and a missing attribute would be
        indistinguishable from an older version of this integration that
        never had one. The count is left out only when both halves are off,
        where it could never be anything but zero.
        """
        controls = self.coordinator.new_minutes
        hazards = self.coordinator.hazard_new_minutes
        attrs = {
            "new_minutes_controls": controls,
            "new_minutes_hazards": hazards,
        }
        if controls or hazards:
            now = dt_util.now()
            data = self.coordinator.data
            attrs["new"] = _count_new(data.controls, controls, now) + _count_new(
                data.hazards, hazards, now
            )
        return attrs

    def _timestamps(self) -> dict:
        return {
            "last_update_controls": _iso(self.coordinator.last_update["controls"]),
            "last_update_hazards": _iso(self.coordinator.last_update["hazards"]),
            # The later of the two: when anything about this area last
            # refreshed at all.
            "last_update": _iso(self.coordinator.last_update_any),
        }
