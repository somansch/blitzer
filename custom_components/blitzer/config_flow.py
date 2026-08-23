import voluptuous as vol
import logging

from homeassistant.config_entries import (
    ConfigFlow,
    OptionsFlowWithConfigEntry,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from aiohttp import ClientError, ClientResponseError, ClientSession
from homeassistant.core import callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers.selector import selector
from homeassistant.util import slugify

from .const import (
    CONF_BLACKLIST,
    CONF_KINDS,
    CONF_HAZARD_BLACKLIST,
    CONF_HAZARD_COUNT,
    CONF_HAZARD_SELECTOR,
    CONF_HAZARD_UPDATE_INTERVAL,
    CONF_HAZARDS,
    CONF_SEARCH_MODE,
    CONF_UPDATE_INTERVAL,
    CONF_WAYPOINTS,
    CONF_CORRIDOR_WIDTH,
    DEFAULT_CORRIDOR_WIDTH,
    DEFAULT_HAZARD_COUNT,
    DEFAULT_UPDATE_INTERVAL,
    DOMAIN,
    FORM_DEFAULTS,
    HAZARD_DEFAULTS,
    KIND_DEFAULTS,
    SEARCH_MODE_AREA,
    SEARCH_MODE_ROUTE,
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


def _selected(defaults: dict | None, fallbacks: dict) -> list[str]:
    """The switched-on keys, as the list a multi-select wants."""
    defaults = defaults or {}
    return [key for key, fallback in fallbacks.items() if defaults.get(key, fallback)]


def _as_flags(selected, fallbacks: dict) -> dict:
    """The multi-select's list, back as the flag dict that gets stored.

    The stored shape is deliberately unchanged: every key is present with a
    true/false of its own, exactly as when each one was its own switch. Only
    the form changed, so nothing downstream - coordinator, entities, existing
    entries - has to know about it.
    """
    if not isinstance(selected, (list, tuple, set)):
        return dict(fallbacks)
    return {key: key in selected for key in fallbacks}


def _flags_field(key: str, defaults: dict | None, fallbacks: dict, translation_key: str):
    """One multi-select instead of one switch per option.

    A form field per option cost about 75px of height each: seventeen control
    kinds came to roughly 1300px of scrolling, on a form where the whole group
    is usually left alone. As a single multi-select in list mode the same
    seventeen take about 700px, and the four installation forms 179px instead
    of 296px - measured in the frontend, not estimated.

    "list" rather than "dropdown" because these are read as much as they are
    changed. A dropdown is four times shorter still, but hides every option
    behind a click and renders seventeen chips once they are all on, which is
    the default here.

    The option labels come from the shared selector translations rather than
    being baked in, so they stay translated.
    """
    return {
        vol.Required(key, default=_selected(defaults, fallbacks)): selector(
            {
                "select": {
                    "multiple": True,
                    "mode": "list",
                    "options": list(fallbacks),
                    "translation_key": translation_key,
                    "sort": False,
                }
            }
        )
    }


def _hazard_optional_section(defaults: dict | None = None):
    """The hazards' own count/interval/whitelist/blacklist.

    Separate from the cameras' rather than shared: an area showing 9 cameras
    has no reason to also cap roadworks at 9, an id blacklisted as a camera
    has nothing to do with a hazard id, and the two age at completely
    different rates - a jam is stale within a minute, a permanent roadwork
    is still there next week. Each interval also costs its own request.
    """
    defaults = defaults or {}
    return section(
        vol.Schema(
            {
                vol.Required(
                    CONF_HAZARD_COUNT,
                    default=defaults.get(CONF_HAZARD_COUNT, DEFAULT_HAZARD_COUNT),
                ): int,
                # 0 = no automatic polling of hazards at all - rely on the
                # "refresh_hazards" service instead. Any other value is
                # minutes between polls, independent of the cameras'.
                vol.Required(
                    CONF_HAZARD_UPDATE_INTERVAL,
                    default=defaults.get(CONF_HAZARD_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=1440)),
                # vol.Optional with description={"suggested_value": ...} for
                # the same reason as in _optional_section above: a default=
                # would keep coming back every time the field is cleared.
                vol.Optional(
                    CONF_HAZARD_SELECTOR,
                    description={"suggested_value": defaults.get(CONF_HAZARD_SELECTOR, "")},
                ): str,
                vol.Optional(
                    CONF_HAZARD_BLACKLIST,
                    description={"suggested_value": defaults.get(CONF_HAZARD_BLACKLIST, "")},
                ): str,
            }
        ),
        # Whether or not the section is initially collapsed (default = False)
        {"collapsed": True},
    )


def _optional_section(defaults: dict | None = None):
    """Whitelist/blacklist/count/condition options shared by the area and route branches."""
    defaults = defaults or {}
    return section(
        vol.Schema(
            {
                vol.Required(CONF_CONDITION, default=defaults.get(CONF_CONDITION, True)): bool,
                vol.Required(CONF_COUNT, default=defaults.get(CONF_COUNT, 9)): int,
                # 0 = no automatic polling at all - rely on the "refresh"
                # service instead (e.g. from an automation). Any other value
                # is minutes between polls.
                vol.Required(
                    CONF_UPDATE_INTERVAL,
                    default=defaults.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=1440)),
                # vol.Optional with description={"suggested_value": ...} instead
                # of default=...: default= reappears whenever the field is
                # cleared back to empty, because the frontend omits an empty
                # *Optional* text field from the submitted payload and
                # voluptuous then re-fills it from the schema default.
                # suggested_value only pre-fills the displayed text and isn't
                # re-applied on submit. (vol.Required isn't an option either -
                # the frontend then refuses to submit the field empty at all.)
                vol.Optional(CONF_SELECTOR, description={"suggested_value": defaults.get(CONF_SELECTOR, "")}): str,
                vol.Optional(CONF_BLACKLIST, description={"suggested_value": defaults.get(CONF_BLACKLIST, "")}): str
            }
        ),
        # Whether or not the section is initially collapsed (default = False)
        {"collapsed": True},
    )


def _waypoint_schema(default_location: dict):
    # The location selector needs an explicit default: on any step after the
    # flow's very first one, the frontend can't compute an initial value for
    # it on its own and throws ("Selector location not supported in initial
    # form data"), leaving the whole form blank instead of just that field.
    #
    # add_another always defaults to True (not just below the 2-waypoint
    # minimum): defaulting it to False once the minimum is reached made the
    # wizard silently stop after the 3rd waypoint for anyone who didn't
    # notice the checkbox had flipped and just kept submitting.
    return vol.Schema(
        {
            vol.Required(CONF_LOCATION, default=default_location): selector({"location": {}}),
            vol.Required("add_another", default=True): bool,
        }
    )


def _waypoint_review_schema(default_location: dict):
    """One already-saved waypoint: reposition it or drop it from the route."""
    return vol.Schema(
        {
            vol.Required(CONF_LOCATION, default=default_location): selector({"location": {}}),
            vol.Required("remove", default=False): bool,
        }
    )


def _display_whitelist(value: str | None) -> str:
    """Normalize the legacy ".*" regex default to an empty field for display,
    matching how the coordinator already treats it as "no filter" - so the
    form doesn't keep showing a value the user never actually typed.
    """
    return "" if value in (None, ".*") else value


def _hazard_data(user_input: dict) -> dict:
    """The four hazard keys, lifted back out of their two form sections.

    .get() throughout so that a form submitted without them - an entry saved
    before hazards existed, replayed through an older cached frontend - ends
    up with every hazard switched off rather than a KeyError.
    """
    optional = user_input.get('hazard_optional', {})
    return {
        CONF_HAZARDS: _as_flags(user_input.get(CONF_HAZARDS), HAZARD_DEFAULTS),
        CONF_HAZARD_COUNT: optional.get(CONF_HAZARD_COUNT, DEFAULT_HAZARD_COUNT),
        CONF_HAZARD_UPDATE_INTERVAL: optional.get(
            CONF_HAZARD_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL
        ),
        CONF_HAZARD_SELECTOR: optional.get(CONF_HAZARD_SELECTOR, ""),
        CONF_HAZARD_BLACKLIST: optional.get(CONF_HAZARD_BLACKLIST, ""),
    }


def _hazard_optional_defaults(data) -> dict:
    """What the hazard options section shows when an existing entry is edited."""
    return {
        CONF_HAZARD_COUNT: data.get(CONF_HAZARD_COUNT, DEFAULT_HAZARD_COUNT),
        CONF_HAZARD_UPDATE_INTERVAL: data.get(
            CONF_HAZARD_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL
        ),
        CONF_HAZARD_SELECTOR: data.get(CONF_HAZARD_SELECTOR, ""),
        CONF_HAZARD_BLACKLIST: data.get(CONF_HAZARD_BLACKLIST, ""),
    }


def _route_options_schema(
    corridor_width_default,
    type_defaults=None,
    kind_defaults=None,
    optional_defaults=None,
    hazard_defaults=None,
    hazard_optional_defaults=None,
):
    return vol.Schema(
        {
            vol.Required(CONF_CORRIDOR_WIDTH, default=corridor_width_default): vol.All(
                vol.Coerce(int), vol.Range(min=50, max=5000)
            ),
            **_flags_field(CONF_TYPE, type_defaults, FORM_DEFAULTS, "control_form"),
            **_flags_field(CONF_KINDS, kind_defaults, KIND_DEFAULTS, "control_kind"),
            **_flags_field(CONF_HAZARDS, hazard_defaults, HAZARD_DEFAULTS, "hazard_type"),
            vol.Required('optional'): _optional_section(optional_defaults),
            vol.Required('hazard_optional'): _hazard_optional_section(hazard_optional_defaults),
        }
    )


class BlitzerdeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 6

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._name: str | None = None
        self._waypoints: list[dict] = []

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            self._name = user_input[CONF_NAME]
            # Every entity this entry creates is identified by the entry's
            # name - "blitzer-<name>-<camera id>" and "blitzer-<name>-total".
            # A second entry under the same name therefore produces the same
            # ids, and Home Assistant drops the entities it cannot tell
            # apart: the new area would sit there with nothing in it and only
            # a line in the log to say why. Claiming the name as the entry's
            # unique id turns that into a plain "already configured" the
            # moment it is typed. It also gives the entry an id at all, which
            # the coordinator's log name reads.
            await self.async_set_unique_id(slugify(self._name))
            self._abort_if_unique_id_configured()
            # ...and the same check against entries that predate the unique
            # id, which carry none and so collide with nothing. They are the
            # ones already holding the entity ids a duplicate would claim, so
            # leaving them out would let exactly the case this prevents slip
            # through. Compared slugified, so both paths agree on what counts
            # as the same name.
            if any(
                slugify(entry.data.get(CONF_NAME, "")) == slugify(self._name)
                for entry in self._async_current_entries()
            ):
                return self.async_abort(reason="already_configured")
            if user_input[CONF_SEARCH_MODE] == SEARCH_MODE_ROUTE:
                self._waypoints = []
                return await self.async_step_waypoint()
            return await self.async_step_area()

        data_schema = vol.Schema(
            {
                vol.Required(CONF_NAME): str,
                vol.Required(CONF_SEARCH_MODE, default=SEARCH_MODE_AREA): selector(
                    {
                        "select": {
                            "options": [SEARCH_MODE_AREA, SEARCH_MODE_ROUTE],
                            "translation_key": "search_mode",
                            "mode": "list",
                        }
                    }
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=data_schema, last_step=False)

    async def async_step_area(self, user_input=None):
        if user_input is not None:
            if CONF_LOCATION not in user_input:  # default location
                return self.async_abort(reason="location_missing")

            return self.async_create_entry(title=f"Blitzer.de {self._name}", data={
                CONF_NAME: self._name,
                CONF_SEARCH_MODE: SEARCH_MODE_AREA,
                CONF_LOCATION: user_input[CONF_LOCATION],
                CONF_TYPE: _as_flags(user_input[CONF_TYPE], FORM_DEFAULTS),
                CONF_KINDS: _as_flags(user_input[CONF_KINDS], KIND_DEFAULTS),
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'].get(CONF_SELECTOR, ""),
                CONF_CONDITION: user_input['optional'][CONF_CONDITION],
                CONF_UPDATE_INTERVAL: user_input['optional'][CONF_UPDATE_INTERVAL],
                CONF_BLACKLIST: user_input['optional'].get(CONF_BLACKLIST, ""),
                **_hazard_data(user_input),
            })

        data_schema = vol.Schema(
            {
                vol.Required(CONF_LOCATION, default={
                    "latitude": self.hass.config.latitude,
                    "longitude": self.hass.config.longitude,
                    "radius": 1000,
                }): selector({"location": {"radius": True}}),
                **_flags_field(CONF_TYPE, None, FORM_DEFAULTS, "control_form"),
                **_flags_field(CONF_KINDS, None, KIND_DEFAULTS, "control_kind"),
                **_flags_field(CONF_HAZARDS, None, HAZARD_DEFAULTS, "hazard_type"),
                vol.Required('optional'): _optional_section(),
                vol.Required('hazard_optional'): _hazard_optional_section(),
            }
        )
        return self.async_show_form(step_id="area", data_schema=data_schema, last_step=True)

    async def async_step_waypoint(self, user_input=None):
        errors = {}
        if user_input is not None:
            self._waypoints.append({
                "latitude": user_input[CONF_LOCATION]["latitude"],
                "longitude": user_input[CONF_LOCATION]["longitude"],
            })
            if not user_input["add_another"]:
                if len(self._waypoints) < 2:
                    errors["base"] = "route_needs_two_waypoints"
                else:
                    return await self.async_step_route_options()

        default_location = self._waypoints[-1] if self._waypoints else {
            "latitude": self.hass.config.latitude,
            "longitude": self.hass.config.longitude,
        }
        return self.async_show_form(
            step_id="waypoint",
            data_schema=_waypoint_schema(default_location),
            errors=errors,
            description_placeholders={"count": str(len(self._waypoints) + 1)},
            last_step=False,
        )

    async def async_step_route_options(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title=f"Blitzer.de {self._name}", data={
                CONF_NAME: self._name,
                CONF_SEARCH_MODE: SEARCH_MODE_ROUTE,
                CONF_WAYPOINTS: self._waypoints,
                CONF_CORRIDOR_WIDTH: user_input[CONF_CORRIDOR_WIDTH],
                CONF_TYPE: _as_flags(user_input[CONF_TYPE], FORM_DEFAULTS),
                CONF_KINDS: _as_flags(user_input[CONF_KINDS], KIND_DEFAULTS),
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'].get(CONF_SELECTOR, ""),
                CONF_CONDITION: user_input['optional'][CONF_CONDITION],
                CONF_UPDATE_INTERVAL: user_input['optional'][CONF_UPDATE_INTERVAL],
                CONF_BLACKLIST: user_input['optional'].get(CONF_BLACKLIST, ""),
                **_hazard_data(user_input),
            })

        return self.async_show_form(
            step_id="route_options",
            data_schema=_route_options_schema(DEFAULT_CORRIDOR_WIDTH),
            last_step=True,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for Met."""
        return BlitzerdeOptionsFlow(config_entry)


class BlitzerdeOptionsFlow(OptionsFlowWithConfigEntry):

    def __init__(self, config_entry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry
        self._waypoints: list[dict] = []
        self._existing_waypoints: list[dict] = []
        self._review_index: int = 0

    async def async_step_init(self, user_input=None):
        """Configure options for Met."""
        mode = self.config_entry.data.get(CONF_SEARCH_MODE, SEARCH_MODE_AREA)
        if mode == SEARCH_MODE_ROUTE:
            # Editing waypoints is a multi-screen wizard, so it's split from
            # the corridor/type/optional settings behind a menu - otherwise
            # anyone wanting to tweak just the corridor width would first
            # have to click through every saved waypoint to get there.
            return self.async_show_menu(
                step_id="init",
                menu_options=["edit_waypoints", "edit_settings"],
            )
        return await self.async_step_area()

    async def async_step_edit_waypoints(self, user_input=None):
        self._waypoints = []
        self._existing_waypoints = list(self.config_entry.data.get(CONF_WAYPOINTS, []))
        self._review_index = 0
        if self._existing_waypoints:
            return await self.async_step_waypoint_review()
        return await self.async_step_waypoint()

    async def async_step_edit_settings(self, user_input=None):
        # Keep the route's waypoints untouched; only route_options's fields
        # (corridor width, types, whitelist/blacklist/...) are being edited.
        self._waypoints = list(self.config_entry.data.get(CONF_WAYPOINTS, []))
        return await self.async_step_route_options()

    async def async_step_waypoint_review(self, user_input=None):
        """Step through the route's already-saved waypoints one at a time,
        so each can be repositioned or dropped before any new ones are
        appended - editing a route no longer means redrawing it from
        scratch.
        """
        if user_input is not None:
            if not user_input["remove"]:
                self._waypoints.append({
                    "latitude": user_input[CONF_LOCATION]["latitude"],
                    "longitude": user_input[CONF_LOCATION]["longitude"],
                })
            self._review_index += 1

        if self._review_index >= len(self._existing_waypoints):
            return await self.async_step_waypoint()

        return self.async_show_form(
            step_id="waypoint_review",
            data_schema=_waypoint_review_schema(self._existing_waypoints[self._review_index]),
            description_placeholders={
                "index": str(self._review_index + 1),
                "total": str(len(self._existing_waypoints)),
            },
            last_step=False,
        )

    async def async_step_area(self, user_input=None):
        if user_input is not None:
            if CONF_LOCATION not in user_input:  # default location
                user_input[CONF_LOCATION] = self.config_entry.data.get(CONF_LOCATION)

            data = {
                CONF_NAME: self.config_entry.data.get(CONF_NAME),
                CONF_SEARCH_MODE: SEARCH_MODE_AREA,
                CONF_LOCATION: user_input[CONF_LOCATION],
                CONF_TYPE: _as_flags(user_input[CONF_TYPE], FORM_DEFAULTS),
                CONF_KINDS: _as_flags(user_input[CONF_KINDS], KIND_DEFAULTS),
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'].get(CONF_SELECTOR, ""),
                CONF_CONDITION: user_input['optional'][CONF_CONDITION],
                CONF_UPDATE_INTERVAL: user_input['optional'][CONF_UPDATE_INTERVAL],
                CONF_BLACKLIST: user_input['optional'].get(CONF_BLACKLIST, ""),
                **_hazard_data(user_input),
            }
            self.hass.config_entries.async_update_entry(
                self._config_entry, data=data
            )
            return self.async_create_entry(
                title=self._config_entry.title, data=data
            )

        data_schema = vol.Schema(
            {
                vol.Required(
                    CONF_LOCATION, default=self.config_entry.data.get(CONF_LOCATION)
                ): selector({"location": {"radius": True}}),
                **_flags_field(CONF_TYPE, self.config_entry.data.get(CONF_TYPE), FORM_DEFAULTS, "control_form"),
                **_flags_field(CONF_KINDS, self.config_entry.data.get(CONF_KINDS), KIND_DEFAULTS, "control_kind"),
                **_flags_field(CONF_HAZARDS, self.config_entry.data.get(CONF_HAZARDS), HAZARD_DEFAULTS, "hazard_type"),
                vol.Required('optional'): _optional_section({
                    CONF_CONDITION: self.config_entry.data.get(CONF_CONDITION),
                    CONF_UPDATE_INTERVAL: self.config_entry.data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
                    CONF_COUNT: self.config_entry.data.get(CONF_COUNT),
                    CONF_SELECTOR: _display_whitelist(self.config_entry.data.get(CONF_SELECTOR)),
                    CONF_BLACKLIST: self.config_entry.data.get(CONF_BLACKLIST, ""),
                }),
                vol.Required('hazard_optional'): _hazard_optional_section(
                    _hazard_optional_defaults(self.config_entry.data)
                ),
            }
        )
        return self.async_show_form(step_id="area", data_schema=data_schema, last_step=True)

    async def async_step_waypoint(self, user_input=None):
        errors = {}
        if user_input is not None:
            self._waypoints.append({
                "latitude": user_input[CONF_LOCATION]["latitude"],
                "longitude": user_input[CONF_LOCATION]["longitude"],
            })
            if not user_input["add_another"]:
                if len(self._waypoints) < 2:
                    errors["base"] = "route_needs_two_waypoints"
                else:
                    return await self.async_step_route_options()

        default_location = self._waypoints[-1] if self._waypoints else {
            "latitude": self.hass.config.latitude,
            "longitude": self.hass.config.longitude,
        }
        return self.async_show_form(
            step_id="waypoint",
            data_schema=_waypoint_schema(default_location),
            errors=errors,
            description_placeholders={"count": str(len(self._waypoints) + 1)},
            last_step=False,
        )

    async def async_step_route_options(self, user_input=None):
        if user_input is not None:
            data = {
                CONF_NAME: self.config_entry.data.get(CONF_NAME),
                CONF_SEARCH_MODE: SEARCH_MODE_ROUTE,
                CONF_WAYPOINTS: self._waypoints,
                CONF_CORRIDOR_WIDTH: user_input[CONF_CORRIDOR_WIDTH],
                CONF_TYPE: _as_flags(user_input[CONF_TYPE], FORM_DEFAULTS),
                CONF_KINDS: _as_flags(user_input[CONF_KINDS], KIND_DEFAULTS),
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'].get(CONF_SELECTOR, ""),
                CONF_CONDITION: user_input['optional'][CONF_CONDITION],
                CONF_UPDATE_INTERVAL: user_input['optional'][CONF_UPDATE_INTERVAL],
                CONF_BLACKLIST: user_input['optional'].get(CONF_BLACKLIST, ""),
                **_hazard_data(user_input),
            }
            self.hass.config_entries.async_update_entry(
                self._config_entry, data=data
            )
            return self.async_create_entry(
                title=self._config_entry.title, data=data
            )

        return self.async_show_form(
            step_id="route_options",
            data_schema=_route_options_schema(
                self.config_entry.data.get(CONF_CORRIDOR_WIDTH, DEFAULT_CORRIDOR_WIDTH),
                type_defaults=self.config_entry.data.get(CONF_TYPE),
                kind_defaults=self.config_entry.data.get(CONF_KINDS),
                optional_defaults={
                    CONF_CONDITION: self.config_entry.data.get(CONF_CONDITION),
                    CONF_UPDATE_INTERVAL: self.config_entry.data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
                    CONF_COUNT: self.config_entry.data.get(CONF_COUNT),
                    CONF_SELECTOR: _display_whitelist(self.config_entry.data.get(CONF_SELECTOR)),
                    CONF_BLACKLIST: self.config_entry.data.get(CONF_BLACKLIST, ""),
                },
                hazard_defaults=self.config_entry.data.get(CONF_HAZARDS),
                hazard_optional_defaults=_hazard_optional_defaults(self.config_entry.data),
            ),
            last_step=True,
        )
