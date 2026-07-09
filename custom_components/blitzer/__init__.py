from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers.device_registry import DeviceEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN
from .coordinator import BlitzerdeCoordinator

from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]


@dataclass
class RuntimeData:
    """Class to hold your data."""

    coordinator: DataUpdateCoordinator
    cancel_update_listener: Callable


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Integration from a config entry."""

    hass.data.setdefault(DOMAIN, {})

    # Initialise the coordinator that manages data updates from your api.
    # This is defined in coordinator.py
    coordinator = BlitzerdeCoordinator(hass, config_entry)

    # Perform an initial data load from api.
    # async_config_entry_first_refresh() is special in that it does not log errors if it fails
    await coordinator.async_config_entry_first_refresh()

    # Test to see if api initialised correctly, else raise ConfigNotReady to make HA retry setup
    # TODO: Change this to match how your api will know if connected or successful update
    if not coordinator.api.connected:
        raise ConfigEntryNotReady

    # Initialise a listener for config flow options changes.
    # See config_flow for defining an options setting that shows up as configure on the integration.
    cancel_update_listener = config_entry.add_update_listener(_async_update_listener)

    # Add the coordinator and update listener to hass data to make
    hass.data[DOMAIN][config_entry.entry_id] = RuntimeData(
        coordinator, cancel_update_listener
    )

    # Setup platforms (based on the list of entity types in PLATFORMS defined above)
    # This calls the async_setup method in each of your entity type files.
    await hass.config_entries.async_forward_entry_setups(config_entry, PLATFORMS);

    # Return true to denote a successful setup.
    return True


async def _async_update_listener(hass: HomeAssistant, config_entry):
    """Handle config options update."""
    # Reload the integration when the options change.
    await hass.config_entries.async_reload(config_entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # This is called when you remove your integration or shutdown HA.
    # If you have created any custom services, they need to be removed here too.

    # Remove the config options update listener
    hass.data[DOMAIN][config_entry.entry_id].cancel_update_listener()

    # Unload platforms
    unload_ok = await hass.config_entries.async_unload_platforms(
        config_entry, PLATFORMS
    )

    # Remove the config entry from the hass data object.
    if unload_ok:
        hass.data[DOMAIN].pop(config_entry.entry_id)

    # Return that unloading was successful.
    return unload_ok

async def async_migrate_entry(hass: HomeAssistant, config_entry: ConfigEntry):
    """Migrate old entry."""
    _LOGGER.debug("Migrating configuration from version %s", config_entry.version)

    if config_entry.version == 1:
        hass.config_entries.async_update_entry(config_entry, data={
                CONF_NAME: config_entry.data.get(CONF_NAME),
                CONF_COUNT: 9,
                CONF_TYPE: {
                    "mobile": True,
                    "trailer": True,
                    "fixed": False
                },
                CONF_LOCATION: config_entry.data.get(CONF_LOCATION),
                CONF_SELECTOR: config_entry.data.get(CONF_SELECTOR),
                CONF_CONDITION: True
        }, version=4)
    
    if config_entry.version == 2:
        hass.config_entries.async_update_entry(config_entry, data={
                CONF_NAME: config_entry.data.get(CONF_NAME),
                CONF_COUNT: config_entry.data.get(CONF_COUNT),
                CONF_TYPE: {
                    "mobile": True,
                    "trailer": True,
                    "fixed": False
                },
                CONF_LOCATION: config_entry.data.get(CONF_LOCATION),
                CONF_SELECTOR: config_entry.data.get(CONF_SELECTOR),
                CONF_CONDITION: True
        }, version=4)
    
    if config_entry.version == 3:
        hass.config_entries.async_update_entry(config_entry, data={
                CONF_NAME: config_entry.data.get(CONF_NAME),
                CONF_COUNT: config_entry.data.get(CONF_COUNT),
                CONF_TYPE: {
                    "mobile": True,
                    "trailer": True,
                    "fixed": False
                },
                CONF_LOCATION: config_entry.data.get(CONF_LOCATION),
                CONF_SELECTOR: config_entry.data.get(CONF_SELECTOR),
                CONF_CONDITION: True
        }, version=4)

    _LOGGER.debug("Migration to configuration version %s successful", config_entry.version)

    return True
