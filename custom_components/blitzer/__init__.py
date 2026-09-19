from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import logging

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ConfigEntryNotReady, ServiceValidationError
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify
from homeassistant.helpers.device_registry import DeviceEntry
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
import homeassistant.helpers.config_validation as cv

from .const import (
    ATTR_CONFIG_ENTRY_ID,
    CONF_KINDS,
    CONF_ORS_DESTINATION,
    CONF_ORS_START,
    CONF_ORS_VIAS,
    CONF_ROUTE_DISTANCE,
    CONF_ROUTE_DURATION,
    CONF_SEARCH_MODE,
    CONF_WAYPOINTS,
    ROUTE_MODES,
    SEARCH_MODE_ROUTE_ORS,
    DOMAIN,
    KIND_DEFAULTS,
    SERVICE_REFRESH_CONTROLS,
    SERVICE_REFRESH_HAZARDS,
)
from .bundle import async_install_blueprints, async_register_card
from .ors import async_forget_key
from .coordinator import (
    BlitzerdeAPIData,
    BlitzerdeCoordinator,
    hazard_key,
    hazard_reason,
    poi_id,
)

from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.GEO_LOCATION,
    # The two "counts as new for" windows, so they can be set where the
    # sensors they govern are listed rather than only inside the options
    # dialog. See number.py.
    Platform.NUMBER,
]

_REFRESH_SCHEMA = vol.Schema({vol.Required(ATTR_CONFIG_ENTRY_ID): str})

# Areas and routes are set up in the interface, and there has never been a
# way to write one in configuration.yaml. Saying so outright turns a
# "blitzer:" block there into a clear message rather than silence.
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


@dataclass
class RuntimeData:
    """Class to hold your data."""

    coordinator: DataUpdateCoordinator
    cancel_update_listener: Callable


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Put what the download brings with it in place, once for the domain.

    The dashboard card and the blueprint are part of the integration rather
    than two further things to install, so they are set up here - before the
    first area is, and whether or not one is ever added. See bundle.py.
    """
    await async_register_card(hass)
    await async_install_blueprints(hass)
    websocket_api.async_register_command(hass, websocket_route)
    return True


@websocket_api.websocket_command(
    {"type": "blitzer/route", "config_entry_id": str}
)
@callback
def websocket_route(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The line a route entry searches along, for the card.

    Both route modes: openrouteservice's route, or the straight lines between
    hand-placed waypoints - which is exactly what that entry searches, so it
    is what the card should show.

    Asked for rather than published as an attribute: attributes are written
    to the recorder with every state change, which for a sensor polling once
    a minute would store the same route again every minute. The card asks
    once when it draws its map.

    Answers with points set to null for every other kind of entry, so the
    card can ask about any area without first working out what it is.
    """
    entry = hass.config_entries.async_get_entry(msg["config_entry_id"])
    if entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Not a Blitzer.de entry")
        return
    data = entry.data
    mode = data.get(CONF_SEARCH_MODE)
    waypoints = data.get(CONF_WAYPOINTS) or []
    if mode not in ROUTE_MODES or not waypoints:
        connection.send_result(msg["id"], {"points": None})
        return

    def end(value):
        value = value or {}
        return {
            "latitude": value.get("latitude"),
            "longitude": value.get("longitude"),
            "label": value.get("label", ""),
        }

    # A waypoint route has no named ends: its first and last points are them.
    ors = mode == SEARCH_MODE_ROUTE_ORS
    connection.send_result(
        msg["id"],
        {
            "mode": mode,
            "points": [[p["latitude"], p["longitude"]] for p in waypoints],
            "start": end(data.get(CONF_ORS_START) if ors else waypoints[0]),
            "destination": end(data.get(CONF_ORS_DESTINATION) if ors else waypoints[-1]),
            "vias": [[v["latitude"], v["longitude"]] for v in data.get(CONF_ORS_VIAS, [])],
            "distance": data.get(CONF_ROUTE_DISTANCE),
            "duration": data.get(CONF_ROUTE_DURATION),
        },
    )


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Set up Integration from a config entry."""

    hass.data.setdefault(DOMAIN, {})

    # Initialise the coordinator that manages data updates from your api.
    # This is defined in coordinator.py
    coordinator = BlitzerdeCoordinator(hass, config_entry)

    if coordinator.update_interval is None:
        # Nothing polls on a schedule - both intervals are 0 ("manual
        # only"), or nothing is selected to look for. Entities start empty
        # rather than making an API call on every startup/reload; the whole
        # point of manual mode is avoiding automatic requests. The "refresh"
        # and "refresh_hazards" actions populate them.
        coordinator.async_set_updated_data(BlitzerdeAPIData(controls=[]))
    else:
        # Perform an initial data load from api.
        # async_config_entry_first_refresh() is special in that it does not log errors if it fails
        await coordinator.async_config_entry_first_refresh()

        # The API client sets `connected` on its first successful response,
        # so a False here means the initial fetch never got one - retry setup
        # rather than leaving the entry up with nothing in it.
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
    for service, handler in (
        (SERVICE_REFRESH_CONTROLS, _async_handle_refresh_controls),
        (SERVICE_REFRESH_HAZARDS, _async_handle_refresh_hazards),
    ):
        if not hass.services.has_service(DOMAIN, service):
            hass.services.async_register(
                DOMAIN,
                service,
                handler,
                schema=_REFRESH_SCHEMA,
                supports_response=SupportsResponse.OPTIONAL,
            )

    # Return true to denote a successful setup.
    return True


def _coordinator_for(call: ServiceCall) -> BlitzerdeCoordinator:
    """The coordinator of the area/route the call names."""
    hass = call.hass
    entry_id = call.data[ATTR_CONFIG_ENTRY_ID]
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(f"'{entry_id}' is not a Blitzer.de config entry")

    # An entry that exists but is not running has no coordinator to drive.
    # It is a normal enough state to answer properly rather than with a
    # KeyError and a traceback: a tracker entry whose device has not reported
    # a position yet sits in "retrying setup" until it does, and an
    # automation refreshing on a schedule would otherwise fill the log while
    # it waits.
    runtime_data: RuntimeData | None = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if runtime_data is None:
        raise ServiceValidationError(
            f"'{entry.title}' is not running right now"
            + (f" ({entry.reason})" if entry.reason else "")
        )
    return runtime_data.coordinator


async def _async_handle_refresh_controls(call: ServiceCall) -> ServiceResponse:
    """Immediately poll one area/route's controls, e.g. from an automation,
    instead of waiting for their next scheduled poll - the point of
    "update_interval: 0" (fully manual polling), but works just as well as
    an on-demand refresh for entries that do poll automatically. Returns
    what it found so an automation can use it directly (e.g. in a
    notification) without a separate template step to read the resulting
    entity states.

    Controls only. The hazards keep whatever they last fetched and cost no
    request here - "blitzer.refresh_hazards" is their counterpart.
    """
    coordinator = _coordinator_for(call)
    await coordinator.async_refresh_kind("controls")

    controls = coordinator.data.controls if coordinator.data else []
    return {
        "controls": [
            {
                "id": item["backend"].split("-")[-1],
                "vmax": item.get("vmax"),
                "city": item["address"]["city"],
                "street": item["address"]["street"],
                "latitude": item.get("lat"),
                "longitude": item.get("lng"),
            }
            for item in controls
        ]
    }


async def _async_handle_refresh_hazards(call: ServiceCall) -> ServiceResponse:
    """The same for one area/route's hazards, and only those.

    ".get()" throughout rather than indexing: a traffic control centre
    report has no postcode, sometimes no city, and carries its road at the
    top level instead of under "address".
    """
    coordinator = _coordinator_for(call)
    await coordinator.async_refresh_kind("hazards")

    hazards = coordinator.data.hazards if coordinator.data else []
    return {
        "hazards": [
            {
                "id": poi_id(item),
                "type": hazard_key(item),
                "reason": hazard_reason(item),
                "city": (item.get("address") or {}).get("city", ""),
                "street": (item.get("address") or {}).get("street") or item.get("street", ""),
                "latitude": item.get("lat"),
                "longitude": item.get("lng"),
            }
            for item in hazards
        ]
    }


async def _async_update_listener(hass: HomeAssistant, config_entry):
    """Handle config options update."""
    # Almost everything here changes what is fetched or how it is filtered,
    # and the only way to apply that is to build the entry again. The two
    # "counts as new for" windows are the exception - settable from the
    # device page, one step at a time, and changing nothing but a number two
    # sensors report. The coordinator takes those on directly.
    runtime = hass.data.get(DOMAIN, {}).get(config_entry.entry_id)
    if runtime and runtime.coordinator.absorb_windows(config_entry):
        return
    await hass.config_entries.async_reload(config_entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # This is called when you remove your integration or shutdown HA.
    # If you have created any custom services, they need to be removed here too.

    # Remove the config options update listener
    runtime = hass.data[DOMAIN][config_entry.entry_id]
    runtime.cancel_update_listener()
    # An entry going away takes its repair with it - it cannot be failing
    # any more, and a reload starts its count afresh.
    ir.async_delete_issue(hass, DOMAIN, runtime.coordinator.repair_issue_id)

    # Unload platforms
    unload_ok = await hass.config_entries.async_unload_platforms(
        config_entry, PLATFORMS
    )

    # Remove the config entry from the hass data object.
    if unload_ok:
        hass.data[DOMAIN].pop(config_entry.entry_id)

    # Return that unloading was successful.
    return unload_ok

async def async_remove_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> None:
    """Forget the saved openrouteservice key along with the last entry.

    Home Assistant takes the entry off its list before calling this, so an
    empty list means nothing of the integration is left. A key saved "for
    further routes" then has nothing left to be for, and a credential should
    not outlive what it was given to.
    """
    if not hass.config_entries.async_entries(DOMAIN):
        await async_forget_key(hass)


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

    if config_entry.version == 4:
        # The camera switches were one axis mixing two questions: how a
        # camera is installed, and what it measures. "redlight" sat among
        # the installation forms while being neither, and sixteen different
        # kinds of fixed control shared a single "fixed" switch. Version 5
        # splits them into CONF_TYPE (the form) and CONF_KINDS (the kind).
        old = config_entry.data.get(CONF_TYPE) or {}
        old_fixed = old.get("fixed", False)
        old_redlight = old.get("redlight", False)
        forms = {
            "mobile": old.get("mobile", True),
            "trailer": old.get("trailer", True),
            # A red light camera is a fixed installation; the old code asked
            # for the fixed type codes whenever either switch was on, so
            # either switch has to keep the form on now.
            "fixed": old_fixed or old_redlight,
            "archive": old.get("archive", False),
        }
        kinds = dict(KIND_DEFAULTS)
        if old_fixed and not old_redlight:
            # This combination used to drop everything with a vmax of "/",
            # which is exactly the red light kind.
            kinds["redlight"] = False
        hass.config_entries.async_update_entry(
            config_entry,
            data={**config_entry.data, CONF_TYPE: forms, CONF_KINDS: kinds},
            version=5,
        )

    if config_entry.version == 5:
        # Version 6 changes what an entity is identified by, for two reasons.
        #
        # One: the two halves are now symmetric. The control half used to be
        # the unmarked one - "blitzer-<name>-<id>" against the hazards'
        # "blitzer-hazard-<name>-<id>" - because for years it was the only
        # half there was.
        #
        # Two, and the real bug: the identifier contained the *display name*.
        # Rename an entry and every unique id changed with it, so Home
        # Assistant saw a completely new set of entities and left the old
        # ones behind as orphans. The entry id never changes.
        name = config_entry.data.get(CONF_NAME, "")
        entry_id = config_entry.entry_id
        sensors = {
            f"{DOMAIN}-{name}-total": (f"{DOMAIN}-control-{entry_id}-total", "anzahl_kontrollen"),
            f"{DOMAIN}-hazard-{name}-total": (f"{DOMAIN}-hazard-{entry_id}-total", "anzahl_gefahren"),
            f"{DOMAIN}-all-{name}-total": (f"{DOMAIN}-combined-{entry_id}-total", "anzahl_gesamt"),
        }
        area = slugify(name)

        registry = er.async_get(hass)
        for entry in list(er.async_entries_for_config_entry(registry, config_entry.entry_id)):
            if entry.unique_id in sensors:
                # The three counts are worth carrying across: they hold
                # history, and their entity ids are the ones people put in
                # dashboards. The id is rewritten too, because
                # "sensor.blitzer_blitzer_berlin_total" names the domain
                # twice and says nothing about what it counts.
                new_unique_id, suffix = sensors[entry.unique_id]
                changes = {"new_unique_id": new_unique_id}
                wanted = f"{entry.domain}.{area}_{suffix}"
                # Only claim the id if nothing holds it; a collision raises,
                # and losing the whole migration over a cosmetic rename
                # would be a poor trade.
                if entry.entity_id != wanted and not registry.async_get(wanted):
                    changes["new_entity_id"] = wanted
                registry.async_update_entity(entry.entity_id, **changes)
                continue

            # Every marker on the map is created and removed as the data
            # changes anyway, so none is stable enough to reference. Dropping
            # the registry entry lets the next poll recreate it with the new
            # identifier, the new name and an entity id to match. That works
            # only because the identifier really does change for both halves
            # here: Home Assistant remembers a removed entry and restores its
            # old entity id if the same unique id comes back.
            if entry.domain == "geo_location":
                registry.async_remove(entry.entity_id)

        hass.config_entries.async_update_entry(config_entry, version=6)

    _LOGGER.debug("Migration to configuration version %s successful", config_entry.version)

    return True
