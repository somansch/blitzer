import logging

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
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
    """Set up the Sensors."""
    # This gets the data update coordinator from hass.data as specified in your __init__.py
    coordinator: BlitzerdeCoordinator = hass.data[DOMAIN][
        config_entry.entry_id
    ].coordinator

    # Enumerate all the sensors in your data value from your DataUpdateCoordinator and add an instance of your sensor class
    # to a list for each one.
    # This maybe different in your specific case, depending on how your data is structured
    sensors = [
        SensorMapTotal(coordinator),
    ]

    # Create the sensors.
    async_add_entities(sensors)

class SensorMapTotal(CoordinatorEntity):
    
    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_icon = "mdi:car"
    
    def __init__(self, coordinator: BlitzerdeCoordinator) -> None:
        super().__init__(coordinator)
        self.name = f"Blitzer.de {self.coordinator.displayname} Anzahl"
        self.unique_id = f"{DOMAIN}-{self.coordinator.displayname}-total"

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()
    
    @property
    def state(self):
        item_count = len(self.coordinator.data.mapdata)
        if item_count > self.coordinator.sensorcount:
            return self.coordinator.sensorcount
        return item_count

    @property
    def extra_state_attributes(self):
        attrs = {}
        attrs["state_class"] = SensorStateClass.MEASUREMENT
        for mapitem in self.coordinator.data.mapdata:
            name = mapitem['address']['city']
            if name in attrs:
                attrs[name] = attrs[name] + 1
            else:
                attrs[name] = 1
        
        return attrs
