from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ConfigEntryNotReady, ServiceValidationError
from homeassistant.helpers.device_registry import DeviceEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import ATTR_CONFIG_ENTRY_ID, DOMAIN, SERVICE_REFRESH
from .coordinator import BlitzerdeAPIData, BlitzerdeCoordinator

from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.GEO_LOCATION]

_REFRESH_SCHEMA = vol.Schema({vol.Required(ATTR_CONFIG_ENTRY_ID): str})


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

    if coordinator.update_interval is None:
        # Manual-only (update_interval configured as 0): entities start
        # empty rather than making an API call on every startup/reload -
        # the whole point of manual mode is avoiding automatic requests.
        # Use the "refresh" service to populate them.
        coordinator.async_set_updated_data(BlitzerdeAPIData(mapdata=[]))
    else:
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

    # Registered once for the domain, not per entry - guarded since
    # async_setup_entry runs again for every additional area/route.
    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH,
            _async_handle_refresh,
            schema=_REFRESH_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    # Return true to denote a successful setup.
    return True


async def _async_handle_refresh(call: ServiceCall) -> ServiceResponse:
    """Immediately poll one area/route, e.g. from an automation, instead of
    waiting for its next scheduled poll - the point of "update_interval: 0"
    (fully manual polling), but works just as well as an on-demand refresh
    for entries that do poll automatically. Returns the freshly fetched
    cameras so an automation can use them directly (e.g. in a notification)
    without a separate template step to read the resulting entity states.
    """
    hass = call.hass
    entry_id = call.data[ATTR_CONFIG_ENTRY_ID]
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(f"'{entry_id}' is not a Blitzer.de config entry")

    runtime_data: RuntimeData = hass.data[DOMAIN][entry.entry_id]
    await runtime_data.coordinator.async_refresh()

    mapdata = runtime_data.coordinator.data.mapdata if runtime_data.coordinator.data else []
    return {
        "cameras": [
            {
                "id": item["backend"].split("-")[-1],
                "vmax": item.get("vmax"),
                "city": item["address"]["city"],
                "street": item["address"]["street"],
                "latitude": item.get("lat"),
                "longitude": item.get("lng"),
            }
            for item in mapdata
        ]
    }


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
