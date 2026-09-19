import json
import voluptuous as vol
import logging

from homeassistant.config_entries import (
    SOURCE_IMPORT,
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
    CONF_ORS_RETURN_ROUTE,
    CONF_BLACKLIST,
    CONF_KINDS,
    CONF_HAZARD_BLACKLIST,
    CONF_HAZARD_COUNT,
    CONF_HAZARD_NEW_MINUTES,
    CONF_HAZARD_SELECTOR,
    CONF_HAZARD_UPDATE_INTERVAL,
    CONF_HAZARDS,
    CONF_NEW_MINUTES,
    CONF_SEARCH_MODE,
    CONF_TRACKER,
    CONF_TRACKER_RADIUS,
    CONF_UPDATE_INTERVAL,
    CONF_WAYPOINTS,
    CONF_CORRIDOR_WIDTH,
    DEFAULT_CORRIDOR_WIDTH,
    DEFAULT_HAZARD_COUNT,
    DEFAULT_NEW_MINUTES,
    DEFAULT_TRACKER_RADIUS,
    DEFAULT_UPDATE_INTERVAL,
    DOMAIN,
    FORM_DEFAULTS,
    HAZARD_DEFAULTS,
    KIND_DEFAULTS,
    SEARCH_MODE_AREA,
    SEARCH_MODE_ROUTE,
    SEARCH_MODE_ROUTE_ORS,
    SEARCH_MODE_TRACKER,
    CONF_ORS_API_KEY,
    CONF_ORS_SAVE_KEY,
    CONF_ORS_DESTINATION,
    CONF_ORS_START,
    CONF_ORS_VIAS,
    CONF_ROUTE_DISTANCE,
    CONF_ROUTE_DURATION,
    CONF_ROUTE_TOLERANCE,
    DEFAULT_ROUTE_TOLERANCE,
    MAX_ORS_VIAS,
    MAX_ROUTE_TOLERANCE,
    MIN_ROUTE_TOLERANCE,
    ORS_KIND_ADDRESS,
    ORS_SIGNUP_URL,
    ORS_KIND_POINT,
    ORS_KIND_ZONE,
    tracker_position,
)
from .ors import (
    ALTERNATIVE_ROUTES,
    async_load_saved_key,
    async_save_key,
    corridor_width_for,
    ORSAddressNotFound,
    ORSAuthError,
    ORSClient,
    ORSError,
    ORSLimitExceeded,
    ORSNoRoute,
    ORSPointNotRoutable,
    ORSQuotaError,
)

from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION,
    Platform,
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
                # The hazards' own "new" window, separate from the controls'
                # for the same reason their interval is: half an hour is a
                # long time for a tailback and no time at all for a camera.
                # 0 leaves the "new" count off for this half.
                vol.Required(
                    CONF_HAZARD_NEW_MINUTES,
                    default=defaults.get(CONF_HAZARD_NEW_MINUTES, DEFAULT_NEW_MINUTES),
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=10080)),
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
                # How long a report counts as new for the total sensor's
                # "new" attribute. 0 leaves the attribute off entirely.
                vol.Required(
                    CONF_NEW_MINUTES,
                    default=defaults.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=10080)),
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
        CONF_HAZARD_NEW_MINUTES: optional.get(
            CONF_HAZARD_NEW_MINUTES, DEFAULT_NEW_MINUTES
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
        CONF_HAZARD_NEW_MINUTES: data.get(
            CONF_HAZARD_NEW_MINUTES, DEFAULT_NEW_MINUTES
        ),
        CONF_HAZARD_SELECTOR: data.get(CONF_HAZARD_SELECTOR, ""),
        CONF_HAZARD_BLACKLIST: data.get(CONF_HAZARD_BLACKLIST, ""),
    }


def _tracker_choices(hass, current=None) -> list[str]:
    """The device trackers worth offering: those reporting a position now.

    A tracker that cannot say where it is cannot centre a radius, so putting
    it on the list would only buy an entry that fails at its first fetch,
    with the reason arriving well after the form was filled in. The test is
    tracker_position(), the same one the coordinator applies at poll time,
    so the list and the search cannot end up disagreeing.

    Device trackers only. A person carries coordinates the same way and was
    accepted at first, but a person is a layer over whichever tracker is
    reporting for them, and this entry wants the tracker itself.

    The one already saved stays on the list even while it is briefly without
    a fix, so that opening the options to change something else does not
    quietly drop it - unless it is not a device tracker at all, which is
    exactly the case that should no longer be offered.
    """
    choices = [
        state.entity_id
        for state in hass.states.async_all(Platform.DEVICE_TRACKER)
        if tracker_position(state) is not None
    ]
    if (
        current
        and current.startswith(f"{Platform.DEVICE_TRACKER}.")
        and current not in choices
    ):
        choices.append(current)
    return sorted(choices)


def _tracker_schema(
    choices: list[str],
    current=None,
    radius_default=DEFAULT_TRACKER_RADIUS,
    type_defaults=None,
    kind_defaults=None,
    optional_defaults=None,
    hazard_defaults=None,
    hazard_optional_defaults=None,
):
    """One form: which tracker, how wide a circle, and the area form below.

    No map, and nothing showing where the tracker is. A form map is always
    editable - Home Assistant has no read-only one, and a location selector
    takes nothing but "radius" and "icon" - so a marker here would be a
    control that looks like a setting and does nothing, since the centre of
    this search is read from the tracker again at every poll rather than
    saved once. A plain number says the same thing without the trap.

    Everything under those two is the area form field for field: an entry
    that follows a car reports the same things an entry around a fixed point
    does.
    """
    return vol.Schema(
        {
            vol.Required(
                CONF_TRACKER,
                description={"suggested_value": current},
            ): selector({"entity": {"include_entities": choices}}),
            # Bounded, unlike the area mode's radius, because that one is
            # dragged on a map and this one is typed: 20km is already a
            # bounding box wide enough to spend a response on roads the
            # device is nowhere near, and a mistyped zero should not get
            # that far.
            vol.Required(CONF_TRACKER_RADIUS, default=radius_default): vol.All(
                vol.Coerce(int), vol.Range(min=50, max=20000)
            ),
            **_flags_field(CONF_TYPE, type_defaults, FORM_DEFAULTS, "control_form"),
            **_flags_field(CONF_KINDS, kind_defaults, KIND_DEFAULTS, "control_kind"),
            **_flags_field(CONF_HAZARDS, hazard_defaults, HAZARD_DEFAULTS, "hazard_type"),
            vol.Required('optional'): _optional_section(optional_defaults),
            vol.Required('hazard_optional'): _hazard_optional_section(hazard_optional_defaults),
        }
    )


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


def _ors_route_schema(
    tolerance_default=DEFAULT_ROUTE_TOLERANCE,
    type_defaults=None,
    kind_defaults=None,
    optional_defaults=None,
    hazard_defaults=None,
    hazard_optional_defaults=None,
    offer_return=False,
):
    """The waypoint route's settings, less the corridor width.

    A route worked out by openrouteservice has a length, and the width is
    derived from it - see corridor_width_for. Asking for it as well would
    offer a setting the next route change silently replaces.

    `offer_return` adds the switch that creates the way back as a second
    entry - on creation only: an entry being edited already has, or has
    not, its counterpart.
    """
    return vol.Schema(
        {
            vol.Required(CONF_ROUTE_TOLERANCE, default=tolerance_default): vol.All(
                vol.Coerce(int),
                vol.Range(min=MIN_ROUTE_TOLERANCE, max=MAX_ROUTE_TOLERANCE),
            ),
            **({vol.Required(CONF_ORS_RETURN_ROUTE, default=False): bool} if offer_return else {}),
            **_flags_field(CONF_TYPE, type_defaults, FORM_DEFAULTS, "control_form"),
            **_flags_field(CONF_KINDS, kind_defaults, KIND_DEFAULTS, "control_kind"),
            **_flags_field(CONF_HAZARDS, hazard_defaults, HAZARD_DEFAULTS, "hazard_type"),
            vol.Required('optional'): _optional_section(optional_defaults),
            vol.Required('hazard_optional'): _hazard_optional_section(hazard_optional_defaults),
        }
    )


def _common_data(user_input: dict) -> dict:
    """Everything below the search geometry, out of a submitted form.

    The same fields every mode stores. The older steps still spell this out
    each on their own; the route steps below share this instead.
    """
    optional = user_input.get("optional", {})
    return {
        CONF_TYPE: _as_flags(user_input.get(CONF_TYPE), FORM_DEFAULTS),
        CONF_KINDS: _as_flags(user_input.get(CONF_KINDS), KIND_DEFAULTS),
        CONF_COUNT: optional.get(CONF_COUNT, 9),
        CONF_SELECTOR: optional.get(CONF_SELECTOR, ""),
        CONF_CONDITION: optional.get(CONF_CONDITION, True),
        CONF_UPDATE_INTERVAL: optional.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
        CONF_NEW_MINUTES: optional.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
        CONF_BLACKLIST: optional.get(CONF_BLACKLIST, ""),
        **_hazard_data(user_input),
    }


def _route_options_kwargs(data) -> dict:
    """What _route_options_schema shows for an entry being edited."""
    if not data:
        return {}
    return {
        "type_defaults": data.get(CONF_TYPE),
        "kind_defaults": data.get(CONF_KINDS),
        "optional_defaults": {
            CONF_CONDITION: data.get(CONF_CONDITION),
            CONF_UPDATE_INTERVAL: data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
            CONF_NEW_MINUTES: data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
            CONF_COUNT: data.get(CONF_COUNT),
            CONF_SELECTOR: _display_whitelist(data.get(CONF_SELECTOR)),
            CONF_BLACKLIST: data.get(CONF_BLACKLIST, ""),
        },
        "hazard_defaults": data.get(CONF_HAZARDS),
        "hazard_optional_defaults": _hazard_optional_defaults(data),
    }


# What an openrouteservice failure is called in the form. The same exception
# can come out of a geocoder call and a routing call; the form only needs to
# say which kind of problem it was. Order matters: ORSError is the base class.
_ORS_ERRORS = (
    (ORSAuthError, "invalid_api_key"),
    (ORSQuotaError, "quota_exceeded"),
    (ORSAddressNotFound, "address_not_found"),
    (ORSPointNotRoutable, "point_not_routable"),
    (ORSNoRoute, "no_route"),
    (ORSLimitExceeded, "route_too_long"),
    (ORSError, "cannot_connect"),
)


def _ors_error_key(err: ORSError) -> str:
    # The form only says what kind of problem it was; the log keeps what
    # openrouteservice actually said, which is what a bug report needs.
    _LOGGER.warning("openrouteservice: %s", err)
    for kind, key in _ORS_ERRORS:
        if isinstance(err, kind):
            return key
    return "cannot_connect"


class _OrsRouteSteps:
    """The steps of a "Route (start/destination)" entry, for both flows.

    Setting one up and editing one walk the same screens - key, start,
    destination, optional vias, then the route on a map with the settings
    below it - so they are written once here and mixed into both flow
    classes. Each flow says what "done" means through _ors_finish, and what
    is already saved through _ors_saved.

    Every end is a zone, a point on the map or an address, picked from a
    menu rather than offered as three optional fields at once: a form cannot
    hide fields, and three half-filled ways of saying one place would need
    rules for which one wins.
    """

    # The key this route keeps for itself. None when it uses the saved one.
    _ors_key: str | None = None
    _ors_key_in_entry: bool = False
    _ors_start: dict | None = None
    _ors_destination: dict | None = None
    _ors_vias: list | None = None
    _ors_route: dict | None = None
    # Every route openrouteservice offered for the current points, fastest
    # first, while one of them is still to be picked.
    _ors_alternatives: list | None = None
    _ors_failure: str | None = None
    # An address found but not yet taken: shown back before it becomes an end.
    _ors_pending: dict | None = None

    def _ors_saved(self) -> dict:
        return {}

    def _ors_load_saved(self) -> None:
        """Pick up where a saved route entry left off, for editing it."""
        saved = self._ors_saved()
        self._ors_key = saved.get(CONF_ORS_API_KEY)
        self._ors_key_in_entry = bool(self._ors_key)
        self._ors_start = saved.get(CONF_ORS_START)
        self._ors_destination = saved.get(CONF_ORS_DESTINATION)
        self._ors_vias = list(saved.get(CONF_ORS_VIAS, []))
        points = [(p["latitude"], p["longitude"]) for p in saved.get(CONF_WAYPOINTS, [])]
        self._ors_route = (
            {
                "points": points,
                "distance": saved.get(CONF_ROUTE_DISTANCE),
                "duration": saved.get(CONF_ROUTE_DURATION),
            }
            if points
            else None
        )

    def _ors_home(self) -> tuple[float, float]:
        return (self.hass.config.latitude, self.hass.config.longitude)

    # --- the key -------------------------------------------------------

    async def _ors_api_key(self) -> str | None:
        """The key to call openrouteservice with: this route's own, else the saved one."""
        return self._ors_key or await async_load_saved_key(self.hass)

    async def async_step_ors_key(self, user_input=None):
        errors = {}
        saved_key = await async_load_saved_key(self.hass)
        has_key = bool(self._ors_key or saved_key)
        if user_input is not None:
            # Left empty, the field keeps the key already there.
            key = (user_input.get(CONF_ORS_API_KEY) or "").strip() or self._ors_key or saved_key
            if not key:
                errors["base"] = "api_key_required"
            else:
                try:
                    await ORSClient(self.hass, key).async_check_key(*self._ors_home())
                except ORSError as err:
                    errors["base"] = _ors_error_key(err)
                else:
                    if user_input.get(CONF_ORS_SAVE_KEY, True):
                        await async_save_key(self.hass, key)
                        self._ors_key = None
                        self._ors_key_in_entry = False
                    else:
                        self._ors_key = key
                        self._ors_key_in_entry = True
                    return await self._ors_after_key()

        # Never filled in. A form's suggested value travels to the browser with
        # the form, password field or not, which would hand the key to anyone
        # who opens this dialog - so a key already there is kept by leaving
        # the field empty instead.
        key_field = vol.Optional(CONF_ORS_API_KEY) if has_key else vol.Required(CONF_ORS_API_KEY)
        return self.async_show_form(
            step_id="ors_key",
            data_schema=vol.Schema(
                {
                    key_field: selector({"text": {"type": "password"}}),
                    vol.Required(
                        CONF_ORS_SAVE_KEY, default=not self._ors_key_in_entry
                    ): bool,
                }
            ),
            errors=errors,
            description_placeholders={"url": ORS_SIGNUP_URL},
            last_step=False,
        )

    async def _ors_after_key(self):
        return await self.async_step_ors_start()

    # --- start and destination ----------------------------------------

    async def async_step_ors_start(self, user_input=None):
        return self.async_show_menu(
            step_id="ors_start",
            menu_options=["ors_start_zone", "ors_start_point", "ors_start_address"],
        )

    async def async_step_ors_destination(self, user_input=None):
        return self.async_show_menu(
            step_id="ors_destination",
            menu_options=[
                "ors_destination_zone",
                "ors_destination_point",
                "ors_destination_address",
            ],
        )

    async def async_step_ors_start_zone(self, user_input=None):
        return await self._ors_end_step("start", ORS_KIND_ZONE, user_input)

    async def async_step_ors_start_point(self, user_input=None):
        return await self._ors_end_step("start", ORS_KIND_POINT, user_input)

    async def async_step_ors_start_address(self, user_input=None):
        return await self._ors_end_step("start", ORS_KIND_ADDRESS, user_input)

    async def async_step_ors_destination_zone(self, user_input=None):
        return await self._ors_end_step("destination", ORS_KIND_ZONE, user_input)

    async def async_step_ors_destination_point(self, user_input=None):
        return await self._ors_end_step("destination", ORS_KIND_POINT, user_input)

    async def async_step_ors_destination_address(self, user_input=None):
        return await self._ors_end_step("destination", ORS_KIND_ADDRESS, user_input)

    def _ors_current(self, end: str) -> dict:
        """The end as set so far in this flow, else as saved, else nothing."""
        attr = self._ors_start if end == "start" else self._ors_destination
        saved = self._ors_saved().get(
            CONF_ORS_START if end == "start" else CONF_ORS_DESTINATION
        )
        return attr or saved or {}

    async def _ors_end_step(self, end: str, kind: str, user_input):
        step_id = f"ors_{end}_{kind}"
        current = self._ors_current(end)
        same_kind = current.get("kind") == kind
        errors = {}
        if user_input is not None:
            place = None
            if kind == ORS_KIND_ZONE:
                zone = user_input["zone"]
                state = self.hass.states.get(zone)
                if state and state.attributes.get("latitude") is not None:
                    place = {
                        "kind": kind,
                        "zone": zone,
                        "latitude": float(state.attributes["latitude"]),
                        "longitude": float(state.attributes["longitude"]),
                        "label": state.attributes.get("friendly_name") or zone,
                    }
                else:
                    errors["base"] = "zone_without_position"
            elif kind == ORS_KIND_POINT:
                loc = user_input[CONF_LOCATION]
                lat, lon = float(loc["latitude"]), float(loc["longitude"])
                place = {
                    "kind": kind,
                    "latitude": lat,
                    "longitude": lon,
                    "label": f"{lat:.5f}, {lon:.5f}",
                }
            else:
                text = user_input["address"].strip()
                try:
                    lat, lon, label = await ORSClient(
                        self.hass, await self._ors_api_key()
                    ).async_geocode(text, self._ors_home())
                except ORSError as err:
                    errors["base"] = _ors_error_key(err)
                else:
                    # Not taken yet: a geocoder's best match can be the right
                    # street in the wrong town, and that should show before
                    # a route is worked out from it.
                    self._ors_pending = {
                        "kind": kind,
                        "address": text,
                        "latitude": lat,
                        "longitude": lon,
                        "label": label,
                    }
                    return await self._ors_confirm_step(end, None)
            if place:
                return await self._ors_accept(end, place)

        if kind == ORS_KIND_ZONE:
            field = {
                vol.Required(
                    "zone",
                    description={"suggested_value": current.get("zone") if same_kind else None},
                ): selector({"entity": {"domain": "zone"}})
            }
        elif kind == ORS_KIND_POINT:
            home = self._ors_home()
            default = (
                {"latitude": current["latitude"], "longitude": current["longitude"]}
                if current.get("latitude") is not None
                else {"latitude": home[0], "longitude": home[1]}
            )
            # An explicit default, for the same reason as the waypoint map:
            # on any step after the first the frontend cannot work one out.
            field = {
                vol.Required(CONF_LOCATION, default=default): selector({"location": {}})
            }
        else:
            field = {
                vol.Required(
                    "address",
                    description={"suggested_value": current.get("address") if same_kind else None},
                ): str
            }
        return self.async_show_form(
            step_id=step_id,
            data_schema=vol.Schema(field),
            errors=errors,
            last_step=False,
        )

    async def _ors_accept(self, end: str, place: dict):
        # A moved end is a different route; the stored one goes.
        self._ors_route = None
        self._ors_alternatives = None
        if end == "start":
            self._ors_start = place
            return await self.async_step_ors_destination()
        self._ors_destination = place
        return await self.async_step_ors_vias()

    async def async_step_ors_start_address_confirm(self, user_input=None):
        return await self._ors_confirm_step("start", user_input)

    async def async_step_ors_destination_address_confirm(self, user_input=None):
        return await self._ors_confirm_step("destination", user_input)

    async def _ors_confirm_step(self, end: str, user_input):
        """Show what the address was found as, and let it be corrected.

        The field comes back filled with the match. Continuing with it
        unchanged takes the match; anything typed over it is looked up again
        and shown again, so a correction is confirmed the same way.
        """
        pending = self._ors_pending
        errors = {}
        shown = pending["label"]
        if user_input is not None:
            text = user_input["address"].strip()
            if text in (pending["label"], pending["address"]):
                self._ors_pending = None
                return await self._ors_accept(end, pending)
            try:
                lat, lon, label = await ORSClient(self.hass, await self._ors_api_key()).async_geocode(
                    text, self._ors_home()
                )
            except ORSError as err:
                errors["base"] = _ors_error_key(err)
                shown = text
            else:
                pending = self._ors_pending = {
                    "kind": ORS_KIND_ADDRESS,
                    "address": text,
                    "latitude": lat,
                    "longitude": lon,
                    "label": label,
                }
                shown = label
        return self.async_show_form(
            step_id=f"ors_{end}_address_confirm",
            data_schema=vol.Schema(
                {vol.Required("address", description={"suggested_value": shown}): str}
            ),
            description_placeholders={"label": pending["label"]},
            errors=errors,
            last_step=False,
        )

    # --- vias ------------------------------------------------------------

    async def async_step_ors_vias(self, user_input=None):
        if self._ors_vias is None:
            self._ors_vias = list(self._ors_saved().get(CONF_ORS_VIAS, []))
        options = []
        if len(self._ors_vias) < MAX_ORS_VIAS:
            options.append("ors_via")
        if self._ors_vias:
            options.append("ors_vias_clear")
        options.append("ors_route")
        return self.async_show_menu(
            step_id="ors_vias",
            menu_options=options,
            description_placeholders={
                "start": (self._ors_start or {}).get("label", ""),
                "destination": (self._ors_destination or {}).get("label", ""),
                "count": str(len(self._ors_vias)),
            },
        )

    async def async_step_ors_vias_clear(self, user_input=None):
        self._ors_vias = []
        self._ors_route = None
        self._ors_alternatives = None
        return await self.async_step_ors_vias()

    async def async_step_ors_via(self, user_input=None):
        if user_input is not None:
            loc = user_input[CONF_LOCATION]
            self._ors_vias.append(
                {"latitude": float(loc["latitude"]), "longitude": float(loc["longitude"])}
            )
            self._ors_route = None
            self._ors_alternatives = None
            return await self.async_step_ors_vias()

        # Halfway between the last point so far and the destination: where
        # the next via most likely belongs, and never somewhere off the map.
        last = self._ors_vias[-1] if self._ors_vias else self._ors_start
        dest = self._ors_destination
        default = {
            "latitude": (last["latitude"] + dest["latitude"]) / 2,
            "longitude": (last["longitude"] + dest["longitude"]) / 2,
        }
        return self.async_show_form(
            step_id="ors_via",
            data_schema=vol.Schema(
                {vol.Required(CONF_LOCATION, default=default): selector({"location": {}})}
            ),
            description_placeholders={"count": str(len(self._ors_vias) + 1)},
            last_step=False,
        )

    # --- the route ---------------------------------------------------------

    # Whether this flow creates entries - the way back is a second one, and
    # only a flow that makes the first can make it.
    _offers_return = False

    def _ors_points(self) -> list[tuple[float, float]]:
        return [
            (self._ors_start["latitude"], self._ors_start["longitude"]),
            *[(v["latitude"], v["longitude"]) for v in (self._ors_vias or [])],
            (self._ors_destination["latitude"], self._ors_destination["longitude"]),
        ]

    def _ors_entry_data(self, route: dict, user_input: dict, reverse: bool = False) -> dict:
        """What a route entry stores, out of a route and the last form. With
        `reverse`, the same for the way back: ends swapped, via points in the
        other order, the route as worked out for that direction."""
        vias = list(self._ors_vias or [])
        return {
            CONF_SEARCH_MODE: SEARCH_MODE_ROUTE_ORS,
            # Only a route keeping its own key stores one; the rest use the
            # saved key, and a key changed there reaches them all.
            **(
                {CONF_ORS_API_KEY: self._ors_key}
                if self._ors_key_in_entry and self._ors_key
                else {}
            ),
            CONF_ORS_START: self._ors_destination if reverse else self._ors_start,
            CONF_ORS_DESTINATION: self._ors_start if reverse else self._ors_destination,
            CONF_ORS_VIAS: vias[::-1] if reverse else vias,
            CONF_WAYPOINTS: [
                {"latitude": lat, "longitude": lon} for lat, lon in route["points"]
            ],
            CONF_ROUTE_DISTANCE: route.get("distance"),
            CONF_ROUTE_DURATION: route.get("duration"),
            CONF_CORRIDOR_WIDTH: corridor_width_for(route.get("distance")),
            CONF_ROUTE_TOLERANCE: user_input[CONF_ROUTE_TOLERANCE],
            **_common_data(user_input),
        }

    async def async_step_ors_route(self, user_input=None):
        saved = self._ors_saved()
        errors = {}
        if user_input is not None and self._ors_route:
            route = self._ors_route
            data = self._ors_entry_data(route, user_input)
            if user_input.get(CONF_ORS_RETURN_ROUTE):
                # The way back is worked out before either entry exists, so a
                # failure leaves nothing half done: the form comes back with
                # the reason, both switches as they were.
                key = await self._ors_api_key()
                try:
                    back = await ORSClient(self.hass, key).async_route(self._ors_points()[::-1])
                except ORSError as err:
                    errors["base"] = _ors_error_key(err)
                else:
                    self._ors_create_return(self._ors_entry_data(back, user_input, reverse=True))
            if not errors:
                return await self._ors_finish(data)

        if not self._ors_route:
            key = await self._ors_api_key()
            if not key:
                return await self.async_step_ors_key()
            try:
                routes = await ORSClient(self.hass, key).async_routes(self._ors_points())
            except ORSError as err:
                self._ors_failure = _ors_error_key(err)
                return await self.async_step_ors_route_failed()
            if len(routes) > 1:
                self._ors_alternatives = routes
                return await self.async_step_ors_alternatives()
            self._ors_route = routes[0]

        route = self._ors_route
        distance = route.get("distance")
        duration = route.get("duration")
        return self.async_show_form(
            step_id="ors_route",
            data_schema=_ors_route_schema(
                tolerance_default=saved.get(CONF_ROUTE_TOLERANCE, DEFAULT_ROUTE_TOLERANCE),
                offer_return=self._offers_return,
                **_route_options_kwargs(saved),
            ),
            errors=errors,
            description_placeholders={
                "start": self._ors_start.get("label", ""),
                "destination": self._ors_destination.get("label", ""),
                "vias": str(len(self._ors_vias or [])),
                "distance": f"{distance / 1000:.1f}" if distance is not None else "?",
                "duration": str(round(duration / 60)) if duration is not None else "?",
                # Referenced by no text. blitzer-card.js watches for a flow step
                # carrying it and draws these points on a native map above the
                # form - a flow has no field that can draw a line.
                "blitzer_route": json.dumps(
                    [[round(lat, 6), round(lon, 6)] for lat, lon in route["points"]],
                    separators=(",", ":"),
                ),
                # The via points, for the same map: without them a route that
                # bends away from where it seems to be going has no visible
                # reason to.
                "blitzer_vias": json.dumps(
                    [
                        [round(v["latitude"], 6), round(v["longitude"], 6)]
                        for v in (self._ors_vias or [])
                    ],
                    separators=(",", ":"),
                ),
            },
            last_step=True,
        )

    # --- alternatives ------------------------------------------------------

    def _ors_alternative_placeholders(self) -> dict:
        routes = self._ors_alternatives or []
        placeholders = {
            "start": self._ors_start.get("label", ""),
            "destination": self._ors_destination.get("label", ""),
            "count": str(len(routes)),
            # Every route for the map in the dialog, fastest first; the
            # first is drawn as the route, the others beside it, numbered.
            "blitzer_route": json.dumps(
                [[round(lat, 6), round(lon, 6)] for lat, lon in routes[0]["points"]],
                separators=(",", ":"),
            ) if routes else "",
            "blitzer_alternatives": json.dumps(
                [
                    [[round(lat, 6), round(lon, 6)] for lat, lon in route["points"]]
                    for route in routes[1:]
                ],
                separators=(",", ":"),
            ),
            "blitzer_vias": "[]",
        }
        for i in range(ALTERNATIVE_ROUTES):
            route = routes[i] if i < len(routes) else {}
            distance = route.get("distance")
            duration = route.get("duration")
            placeholders[f"distance_{i + 1}"] = (
                f"{distance / 1000:.1f}" if distance is not None else "?"
            )
            placeholders[f"duration_{i + 1}"] = (
                str(round(duration / 60)) if duration is not None else "?"
            )
        return placeholders

    async def async_step_ors_alternatives(self, user_input=None):
        """Pick one of the routes openrouteservice offered.

        A menu, one entry per route, each naming its length and time - a
        dropdown could not, its labels being fixed translations. The map in
        the dialog draws all of them, numbered the way the entries are.
        """
        return self.async_show_menu(
            step_id="ors_alternatives",
            menu_options=[
                f"ors_alternative_{i + 1}" for i in range(len(self._ors_alternatives or []))
            ],
            description_placeholders=self._ors_alternative_placeholders(),
        )

    async def _ors_pick_alternative(self, index: int):
        routes = self._ors_alternatives or []
        if index >= len(routes):
            return await self.async_step_ors_route()
        self._ors_route = routes[index]
        return await self.async_step_ors_route()

    async def async_step_ors_alternative_1(self, user_input=None):
        return await self._ors_pick_alternative(0)

    async def async_step_ors_alternative_2(self, user_input=None):
        return await self._ors_pick_alternative(1)

    async def async_step_ors_alternative_3(self, user_input=None):
        return await self._ors_pick_alternative(2)

    async def async_step_ors_route_failed(self, user_input=None):
        """Say why there is no route, then go back to where it can be fixed.

        A form with nothing in it rather than an abort: an abort throws away
        every point already picked, and most of these are one wrong point.
        """
        if user_input is not None:
            if self._ors_failure == "invalid_api_key":
                return await self.async_step_ors_key()
            return await self.async_step_ors_start()
        return self.async_show_form(
            step_id="ors_route_failed",
            data_schema=vol.Schema({}),
            errors={"base": self._ors_failure or "cannot_connect"},
            last_step=False,
        )


class BlitzerdeConfigFlow(_OrsRouteSteps, ConfigFlow, domain=DOMAIN):
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
            if user_input[CONF_SEARCH_MODE] == SEARCH_MODE_TRACKER:
                return await self.async_step_tracker()
            if user_input[CONF_SEARCH_MODE] == SEARCH_MODE_ROUTE_ORS:
                # A key saved with an earlier route is used without asking.
                if await async_load_saved_key(self.hass):
                    return await self.async_step_ors_start()
                return await self.async_step_ors_key()
            return await self.async_step_area()

        data_schema = vol.Schema(
            {
                vol.Required(CONF_NAME): str,
                vol.Required(CONF_SEARCH_MODE, default=SEARCH_MODE_AREA): selector(
                    {
                        "select": {
                            "options": [
                                SEARCH_MODE_AREA,
                                SEARCH_MODE_TRACKER,
                                SEARCH_MODE_ROUTE,
                                SEARCH_MODE_ROUTE_ORS,
                            ],
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
                CONF_NEW_MINUTES: user_input['optional'].get(
                    CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES
                ),
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

    async def async_step_tracker(self, user_input=None):
        choices = _tracker_choices(self.hass)
        if not choices:
            # Nothing on this instance can centre a radius. Said here rather
            # than as an empty dropdown, which reads like a broken form.
            return self.async_abort(reason="no_tracker_with_position")

        if user_input is not None:
            return self.async_create_entry(title=f"Blitzer.de {self._name}", data={
                CONF_NAME: self._name,
                CONF_SEARCH_MODE: SEARCH_MODE_TRACKER,
                CONF_TRACKER: user_input[CONF_TRACKER],
                CONF_TRACKER_RADIUS: user_input[CONF_TRACKER_RADIUS],
                CONF_TYPE: _as_flags(user_input[CONF_TYPE], FORM_DEFAULTS),
                CONF_KINDS: _as_flags(user_input[CONF_KINDS], KIND_DEFAULTS),
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'].get(CONF_SELECTOR, ""),
                CONF_CONDITION: user_input['optional'][CONF_CONDITION],
                CONF_UPDATE_INTERVAL: user_input['optional'][CONF_UPDATE_INTERVAL],
                CONF_NEW_MINUTES: user_input['optional'].get(
                    CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES
                ),
                CONF_BLACKLIST: user_input['optional'].get(CONF_BLACKLIST, ""),
                **_hazard_data(user_input),
            })

        return self.async_show_form(
            step_id="tracker",
            data_schema=_tracker_schema(choices),
            last_step=True,
        )

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
                CONF_NEW_MINUTES: user_input['optional'].get(
                    CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES
                ),
                CONF_BLACKLIST: user_input['optional'].get(CONF_BLACKLIST, ""),
                **_hazard_data(user_input),
            })

        return self.async_show_form(
            step_id="route_options",
            data_schema=_route_options_schema(DEFAULT_CORRIDOR_WIDTH),
            last_step=True,
        )

    _offers_return = True

    async def _ors_finish(self, data):
        return self.async_create_entry(
            title=f"Blitzer.de {self._name}", data={CONF_NAME: self._name, **data}
        )

    def _ors_create_return(self, data: dict) -> None:
        """The way back as an entry of its own, named after this one.

        Through a flow of its own rather than a second async_create_entry,
        which a flow has only one of. Started rather than awaited: this flow
        is still open, and the other must not wait for it.
        """
        suffix = "Rückweg" if self.hass.config.language.startswith("de") else "return"
        name = f"{self._name} - {suffix}"
        self.hass.async_create_task(
            self.hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}, data={CONF_NAME: name, **data}
            )
        )

    async def async_step_import(self, data: dict):
        """An entry made by another flow of this integration - the way back
        of a route. The same name check as a typed one."""
        name = data[CONF_NAME]
        await self.async_set_unique_id(slugify(name))
        self._abort_if_unique_id_configured()
        if any(
            slugify(entry.data.get(CONF_NAME, "")) == slugify(name)
            for entry in self._async_current_entries()
        ):
            return self.async_abort(reason="already_configured")
        return self.async_create_entry(title=f"Blitzer.de {name}", data=data)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for Met."""
        return BlitzerdeOptionsFlow(config_entry)


class BlitzerdeOptionsFlow(_OrsRouteSteps, OptionsFlowWithConfigEntry):

    def __init__(self, config_entry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry
        self._waypoints: list[dict] = []
        self._existing_waypoints: list[dict] = []
        self._review_index: int = 0

    async def async_step_init(self, user_input=None):
        """Configure options for Met."""
        mode = self.config_entry.data.get(CONF_SEARCH_MODE, SEARCH_MODE_AREA)
        if mode == SEARCH_MODE_ROUTE_ORS:
            # The same split as the waypoint route: picking the ends again is
            # several screens, and the corridor width should not be behind
            # them. The key has an entry of its own - it is the one thing
            # that changes without the route changing.
            self._ors_load_saved()
            return self.async_show_menu(
                step_id="init",
                menu_options=["edit_route", "edit_ors_settings", "edit_ors_key"],
            )
        if mode == SEARCH_MODE_ROUTE:
            # Editing waypoints is a multi-screen wizard, so it's split from
            # the corridor/type/optional settings behind a menu - otherwise
            # anyone wanting to tweak just the corridor width would first
            # have to click through every saved waypoint to get there.
            return self.async_show_menu(
                step_id="init",
                menu_options=["edit_waypoints", "edit_settings"],
            )
        if mode == SEARCH_MODE_TRACKER:
            return await self.async_step_tracker()
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

    async def async_step_edit_ors_settings(self, user_input=None):
        # Its own menu entry, not the waypoint route's: that one names the
        # corridor width, which this mode has none of. The saved route as it
        # is; nothing is asked of openrouteservice.
        return await self.async_step_ors_route()

    async def async_step_edit_route(self, user_input=None):
        return await self.async_step_ors_start()

    async def async_step_edit_ors_key(self, user_input=None):
        return await self.async_step_ors_key()

    def _ors_saved(self) -> dict:
        return dict(self.config_entry.data)

    async def _ors_after_key(self):
        # A new key changes nothing about the route: straight on to the
        # settings, with the route as saved.
        return await self.async_step_ors_route()

    async def _ors_finish(self, data):
        data = {CONF_NAME: self.config_entry.data.get(CONF_NAME), **data}
        self.hass.config_entries.async_update_entry(self._config_entry, data=data)
        return self.async_create_entry(title=self._config_entry.title, data=data)

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
                CONF_NEW_MINUTES: user_input['optional'].get(
                    CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES
                ),
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
                    CONF_NEW_MINUTES: self.config_entry.data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
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

    async def async_step_tracker(self, user_input=None):
        current = self.config_entry.data.get(CONF_TRACKER)
        choices = _tracker_choices(self.hass, current)
        if not choices:
            return self.async_abort(reason="no_tracker_with_position")

        if user_input is not None:
            data = {
                CONF_NAME: self.config_entry.data.get(CONF_NAME),
                CONF_SEARCH_MODE: SEARCH_MODE_TRACKER,
                CONF_TRACKER: user_input[CONF_TRACKER],
                CONF_TRACKER_RADIUS: user_input[CONF_TRACKER_RADIUS],
                CONF_TYPE: _as_flags(user_input[CONF_TYPE], FORM_DEFAULTS),
                CONF_KINDS: _as_flags(user_input[CONF_KINDS], KIND_DEFAULTS),
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'].get(CONF_SELECTOR, ""),
                CONF_CONDITION: user_input['optional'][CONF_CONDITION],
                CONF_UPDATE_INTERVAL: user_input['optional'][CONF_UPDATE_INTERVAL],
                CONF_NEW_MINUTES: user_input['optional'].get(
                    CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES
                ),
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
            step_id="tracker",
            data_schema=_tracker_schema(
                choices,
                current,
                radius_default=self.config_entry.data.get(
                    CONF_TRACKER_RADIUS, DEFAULT_TRACKER_RADIUS
                ),
                type_defaults=self.config_entry.data.get(CONF_TYPE),
                kind_defaults=self.config_entry.data.get(CONF_KINDS),
                optional_defaults={
                    CONF_CONDITION: self.config_entry.data.get(CONF_CONDITION),
                    CONF_UPDATE_INTERVAL: self.config_entry.data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
                    CONF_NEW_MINUTES: self.config_entry.data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
                    CONF_COUNT: self.config_entry.data.get(CONF_COUNT),
                    CONF_SELECTOR: _display_whitelist(self.config_entry.data.get(CONF_SELECTOR)),
                    CONF_BLACKLIST: self.config_entry.data.get(CONF_BLACKLIST, ""),
                },
                hazard_defaults=self.config_entry.data.get(CONF_HAZARDS),
                hazard_optional_defaults=_hazard_optional_defaults(self.config_entry.data),
            ),
            last_step=True,
        )

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
                CONF_NEW_MINUTES: user_input['optional'].get(
                    CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES
                ),
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
                    CONF_NEW_MINUTES: self.config_entry.data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
                    CONF_COUNT: self.config_entry.data.get(CONF_COUNT),
                    CONF_SELECTOR: _display_whitelist(self.config_entry.data.get(CONF_SELECTOR)),
                    CONF_BLACKLIST: self.config_entry.data.get(CONF_BLACKLIST, ""),
                },
                hazard_defaults=self.config_entry.data.get(CONF_HAZARDS),
                hazard_optional_defaults=_hazard_optional_defaults(self.config_entry.data),
            ),
            last_step=True,
        )
