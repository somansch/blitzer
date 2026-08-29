from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
from time import monotonic

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util
from homeassistant.util import location as location_util

from .api import BlitzerdeAPI, APIConnectionError
from .const import DOMAIN

from .const import (
    CODE_KIND,
    CODE_LABELS,
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
    CONF_UPDATE_INTERVAL,
    CONF_WAYPOINTS,
    CONF_CORRIDOR_WIDTH,
    CONTROL_KINDS,
    DEFAULT_HAZARD_COUNT,
    DEFAULT_NEW_MINUTES,
    DEFAULT_UPDATE_INTERVAL,
    FORM_DEFAULTS,
    FORM_KIND_LABELS,
    HAZARD_TYPES,
    SEARCH_MODE_AREA,
    SEARCH_MODE_ROUTE,
    TYPE_ARCHIVE,
    TYPE_FORMS,
    TYPE_TRAILER,
    TYPE_MOBILE,
    TYPE_FIXED,
    UPDATE_INTERVAL_MANUAL,
)

_LOGGER = logging.getLogger(__name__)

# HAZARD_TYPES the other way round: from the code the API sends back to the
# key the config flow, the icons and the attributes use.
_HAZARD_KEYS = {str(code): key for key, code in HAZARD_TYPES.items()}

# The coordinator's timer can fire a fraction of a second early. Without a
# little slack, a two-minute fetch landing at 119.98s would be judged "not
# due" and slip a whole tick behind whichever half set the tick rate.
DUE_TOLERANCE_SECONDS = 5


def poi_id(item: dict) -> str:
    """The id Blitzer.de's own map URL uses, dug out of "backend".

    Cameras and community reports send it as "<n>-<id>"; traffic control
    centre reports send the bare id, and as a number rather than a string -
    hence the str() before splitting.
    """
    return str(item["backend"]).split("-")[-1]


def is_archive(item: dict) -> bool:
    """Whether this is one of Blitzer.de's archived reports.

    Its own map splits on exactly this: a type code of 200 or above lands in
    a separate branch there, under the comment "Archiv-Daten", and is drawn
    smaller than a live control.
    """
    code = str(item.get("type", ""))
    return code.isdigit() and int(code) >= 200


def control_form(item: dict) -> str:
    """How the control is installed: mobile, trailer, fixed or archive.

    The *value* of the flags is what counts, not the presence of the key:
    the API has been seen sending "partly_fixed": "0" - a control explicitly
    marked as not semi-stationary - and asking only whether the key existed
    turned six of those into trailers across the sampled regions. The map
    itself tests the value too.
    """
    if is_archive(item):
        return "archive"
    info = item_info(item)
    if str(info.get("fixed", "")) == "1":
        return "fixed"
    if str(info.get("partly_fixed", "")) == "1":
        return "trailer"
    return "mobile"


def control_kind(item: dict) -> str:
    """What is being measured, from the raw type code.

    An empty string for a code this release has no grouping for, which is
    what a code Blitzer.de adds later would be.
    """
    return CODE_KIND.get(str(item.get("type", "")), "")


def code_label(code, language: str | None = None) -> str:
    """What Blitzer.de itself calls this type code, in the given language.

    Falls back to English for a language it has no wording for, and to an
    empty string for a code it has never heard of - which is what a code
    added by Blitzer.de after this release would be.
    """
    entry = CODE_LABELS.get(str(code))
    if not entry:
        return ""
    return entry.get((language or "en")[:2].lower(), entry["en"])


def control_label(item: dict, language: str | None = None) -> str:
    """What to call this control in one line, in the given language.

    Blitzer.de's own wording for the type code, except for the combinations
    FORM_KIND_LABELS names: those say how the control is set up as well,
    which is the more useful half when only one name fits.
    """
    combo = FORM_KIND_LABELS.get((control_form(item), control_kind(item)))
    if combo:
        return combo.get((language or "en")[:2].lower(), combo["en"])
    return code_label(item.get("type"), language)


def hazard_key(item: dict) -> str:
    """The config key ("tailback_end", "roadwork_permanent", ...) for a hazard item."""
    return _HAZARD_KEYS.get(str(item.get("type", "")), "hazard")


def item_info(item: dict) -> dict:
    """The "info" field as a dict, whatever the API actually put there.

    Four shapes have been seen on the live endpoint, not assumed: a dict for
    a control, a jam or roadworks; a bare `false` for an accident or a
    broken-down vehicle; an empty string for a traffic control centre
    report; and an empty list on the odd control - a mobile camera on the A10
    near Sankt Michael im Lungau was sending that, and being sent twice in
    the same response while it was at it.

    That last one is why controls go through here too, not just hazards. The
    "only confirmed" filter calls .get() on this, and .get() on a list is an
    AttributeError that takes down the whole update - not an
    APIConnectionError, so it isn't caught as a failed poll either. One such
    control anywhere in range was enough to break the entry.
    """
    info = item.get("info")
    return info if isinstance(info, dict) else {}


def hazard_reason(item: dict) -> str:
    """The free-text description, from whichever field is carrying it.

    Traffic control centre reports put a fully written-out bulletin at the
    top level ("A44, Duesseldorf Richtung Essen, ... linker Fahrstreifen
    gesperrt"); the community-reported types put a much shorter note inside
    "info", and most often none at all.
    """
    return item.get("reason") or item_info(item).get("reason") or ""


def _comma_set(raw, lower: bool = False) -> set[str]:
    """Split one of the comma-separated options into a set of entries.

    Back-compat: the whitelist used to be a regex and defaulted to ".*",
    meaning "no filter". Entries created back then still carry that value, so
    it keeps meaning "no filter" here instead of matching a literal city
    named ".*".
    """
    if raw in (None, "", ".*"):
        return set()
    return {
        part.strip().lower() if lower else part.strip()
        for part in raw.split(",")
        if part.strip()
    }


@dataclass
class BlitzerdeAPIData:
    """Class to hold api data."""

    controls: [any]
    # Everything that is not a control, from its own request - see
    # _fetch_hazards. Defaulted so that "no data yet" stays a one-argument
    # construction for callers that only ever cared about the controls.
    hazards: [any] = field(default_factory=list)


class BlitzerdeCoordinator(DataUpdateCoordinator):
    """My coordinator."""

    data: BlitzerdeAPIData

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        """Initialize coordinator."""

        # Set variables from values entered in config flow setup
        self.displayname = config_entry.data[CONF_NAME]
        # What every entity of this entry is identified by. The display name
        # used to serve that purpose, which was wrong in a way that only
        # showed up when someone renamed an entry: every unique id changed
        # with it, so Home Assistant saw the whole set as new entities and
        # left the old ones behind as orphans. The entry id never changes.
        self.entry_id = config_entry.entry_id
        # The entry itself, for the two number entities: setting one of them
        # writes the value back to where the options flow keeps it, so that
        # the device page and the options form are one setting rather than
        # two that drift apart.
        self.entry = config_entry
        # What that data looked like when this coordinator last read it -
        # see absorb_windows() for what the comparison is for. Deep, because
        # a shallow copy would share the type/kind/hazard dicts with the entry
        # itself, and a comparison against them can only ever say "unchanged".
        self._entry_data = deepcopy(dict(config_entry.data))
        # .get() with a default: entries created before route mode existed
        # only ever know the "area" (radius) search.
        self.search_mode = config_entry.data.get(CONF_SEARCH_MODE, SEARCH_MODE_AREA)
        if self.search_mode == SEARCH_MODE_ROUTE:
            self.location = None
            self.waypoints = config_entry.data[CONF_WAYPOINTS]
            self.corridor_width = config_entry.data[CONF_CORRIDOR_WIDTH]
        else:
            self.location = config_entry.data[CONF_LOCATION]
        # Comma-separated city names, same syntax as the blacklist. Cities are
        # compared lowercased, ids as typed.
        self.whitelist = _comma_set(config_entry.data.get(CONF_SELECTOR), lower=True)
        self.controlcount = config_entry.data[CONF_COUNT]
        self.types = config_entry.data[CONF_TYPE]
        self.only_confirmed = config_entry.data[CONF_CONDITION]
        # .get() with a default: entries created before the blacklist option
        # existed don't have this key at all.
        self.blacklist = _comma_set(config_entry.data.get(CONF_BLACKLIST))

        # A control is filtered on two axes, and both have to say yes:
        # how it is installed (mobile / trailer / fixed / archive) and what
        # it measures (speed, red light, distance, weight, ...). Splitting
        # them apart is what makes "only section controls" or "everything
        # except dummies" expressible at all - before, sixteen different
        # kinds of fixed installation shared one switch.
        self.forms = {
            form: self.types.get(form, FORM_DEFAULTS[form]) for form in TYPE_FORMS
        }
        kinds = config_entry.data.get(CONF_KINDS) or {}
        self.kinds = {kind: kinds.get(kind, True) for kind in CONTROL_KINDS}

        def wanted(codes):
            """Those codes whose control kind is switched on."""
            return [c for c in codes if self.kinds.get(CODE_KIND.get(str(c)), True)]

        # Built once here rather than per poll, because whether this entry
        # asks for any control at all also decides whether the control
        # interval gets a say in how often the coordinator wakes up.
        control_types = []
        if self.forms['mobile'] or self.forms['trailer']:
            control_types = control_types + wanted(TYPE_MOBILE)
        if self.forms['trailer']:
            # "ts" is a filter rather than a code - trailers come back as
            # type 1 - so it is not run through wanted(); which of them
            # survive is decided by the kind filter on arrival.
            control_types = control_types + TYPE_TRAILER
        if self.forms['fixed']:
            control_types = control_types + wanted(TYPE_FIXED)
        self.control_types = control_types
        # Kept out of control_types on purpose: the archive gets a request of
        # its own, so that its sheer volume cannot push live controls out of
        # the ~500 a single response carries.
        self.archive_types = wanted(TYPE_ARCHIVE) if self.forms['archive'] else []
        self.want_archive = bool(self.archive_types)

        # Hazards: everything Blitzer.de reports that is not a control. Every
        # one of them is off unless switched on, so an entry that predates
        # this feature - and therefore has none of these keys - keeps
        # reporting exactly the controls it did before.
        hazards = config_entry.data.get(CONF_HAZARDS) or {}
        self.hazard_types = [
            code for key, code in HAZARD_TYPES.items() if hazards.get(key, False)
        ]
        self.hazardcount = config_entry.data.get(CONF_HAZARD_COUNT, DEFAULT_HAZARD_COUNT)
        self.hazard_whitelist = _comma_set(
            config_entry.data.get(CONF_HAZARD_SELECTOR), lower=True
        )
        self.hazard_blacklist = _comma_set(config_entry.data.get(CONF_HAZARD_BLACKLIST))

        # Cameras and hazards poll on their own schedules. Rather than run
        # two coordinators for one config entry - the entities, both refresh
        # actions and hass.data all address a single one, and splitting that
        # would ripple through every one of them - the coordinator ticks at
        # the shorter of the two and each half decides for itself whether
        # its own interval has elapsed.
        self.control_interval = config_entry.data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL)
        # How long each half counts a report as new, in minutes. 0 = that
        # half reports no "new" count at all.
        self.new_minutes = config_entry.data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES)
        self.hazard_new_minutes = config_entry.data.get(
            CONF_HAZARD_NEW_MINUTES, DEFAULT_NEW_MINUTES
        )
        self.hazard_interval = config_entry.data.get(
            CONF_HAZARD_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL
        )
        # Only an interval something actually polls gets a vote: an entry
        # with no hazard type selected must not wake up every minute just
        # because the hazard interval happens to say 1.
        tick_minutes = [
            minutes
            for wanted, minutes in (
                (self.control_types or self.want_archive, self.control_interval),
                (self.hazard_types, self.hazard_interval),
            )
            if wanted and minutes != UPDATE_INTERVAL_MANUAL
        ]
        update_interval = timedelta(minutes=min(tick_minutes)) if tick_minutes else None

        # One device per entry, which every one of its entities belongs to.
        # Two things come out of that: Home Assistant renders the display
        # name as "<area> <entity>" by itself, so the entities no longer
        # carry a redundant "Blitzer.de" prefix - the integration is already
        # called that - and an area's ninety-odd markers group under one
        # card instead of scattering through the entity list.
        #
        # The search mode goes in the model field, which is where Home
        # Assistant puts "what kind of thing is this": an entry is either a
        # radius around a point or a chain of waypoints, and that was
        # previously visible nowhere.
        self.device_info = DeviceInfo(
            identifiers={(DOMAIN, config_entry.entry_id)},
            name=self.displayname,
            manufacturer="Blitzer.de",
            model="Wegpunkte" if self.search_mode == SEARCH_MODE_ROUTE else "Radius",
            entry_type=DeviceEntryType.SERVICE,
        )

        # monotonic() timestamp of each kind's last completed fetch; None
        # means it has not run yet. Monotonic rather than wall clock, so a
        # clock correction can't push the next poll hours away.
        self._last_fetch: dict[str, float | None] = {"controls": None, "hazards": None}
        # The same moments as wall clock, for the count sensors to report.
        # Kept separately because monotonic() above is a number of seconds
        # since some arbitrary point and means nothing to a person; this one
        # is only ever read, never used to decide whether a poll is due.
        self.last_update: dict[str, datetime | None] = {"controls": None, "hazards": None}
        # What one of the refresh actions asked for out of turn, consumed by
        # the next async_update_data.
        self._forced: set[str] = set()

        # Initialise DataUpdateCoordinator
        super().__init__(
            hass,
            _LOGGER,
            # Entries created before the flow claimed a unique id have none,
            # which used to render every one of them as "blitzer (None)" -
            # indistinguishable in the log. The display name is what a person
            # recognises anyway.
            name=f"{DOMAIN} ({config_entry.unique_id or self.displayname})",
            # Method to call on every update interval.
            update_method=self.async_update_data,
            # Polling interval. Will only be polled if there are subscribers.
            # None means nothing here polls on a schedule at all - either
            # both intervals are 0 ("manual only") or nothing is selected to
            # look for. The two refresh actions still work.
            update_interval=update_interval,
        )

        # Initialise your api here
        self.api = BlitzerdeAPI(hass)

    def absorb_windows(self, config_entry: ConfigEntry) -> bool:
        """Take on a changed "new" window without a reload, when that is all
        that changed.

        Both windows are settable from the device page, where a value is
        nudged one step at a time. Every step goes through the config entry -
        the one place the setting lives - and every write to a config entry
        normally reloads the whole thing: entities torn down and rebuilt, the
        card blank for a moment, and a fresh API request for a number that
        changes nothing about what is fetched. Nothing else in the entry can
        be edited without going through the options flow, so "only these two
        moved" is a safe thing to recognise and answer cheaply.

        Returns True when the reload was not needed and this has handled it.
        """
        old, new = self._entry_data, deepcopy(dict(config_entry.data))
        windows = (CONF_NEW_MINUTES, CONF_HAZARD_NEW_MINUTES)

        def rest(data):
            return {k: v for k, v in data.items() if k not in windows}

        if rest(old) != rest(new):
            return False
        self._entry_data = new
        self.entry = config_entry
        self.new_minutes = new.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES)
        self.hazard_new_minutes = new.get(CONF_HAZARD_NEW_MINUTES, DEFAULT_NEW_MINUTES)
        # Both sensors compute their "new" count from these, and both
        # numbers show one of them as their own state.
        self.async_update_listeners()
        return True

    @property
    def last_update_any(self) -> datetime | None:
        """When anything here last refreshed - the later of the two.

        None only while neither kind has ever completed a fetch, which is
        what an entry set to manual-only looks like until its first refresh
        action.
        """
        stamps = [stamp for stamp in self.last_update.values() if stamp is not None]
        return max(stamps) if stamps else None

    async def async_refresh_kind(self, kind: str) -> None:
        """Fetch one kind right now, whatever its interval says.

        Backing the two refresh actions. Each drives only its own half, so
        the other keeps whatever it last fetched and costs no request.
        """
        self._forced.add(kind)
        await self.async_refresh()

    def _is_due(self, kind: str, interval: int) -> bool:
        """Whether this kind should be fetched on this pass."""
        if kind in self._forced:
            return True
        if interval == UPDATE_INTERVAL_MANUAL:
            # Manual means manual, including the very first poll after
            # setup: this kind is only ever fetched by its refresh action.
            return False
        last = self._last_fetch[kind]
        if last is None:
            return True
        return monotonic() - last >= interval * 60 - DUE_TOLERANCE_SECONDS

    async def async_update_data(self):
        """Fetch data from API endpoint.

        This is the place to pre-process the data to lookup tables
        so entities can quickly look up their data.
        """
        try:
            previous = self.data
            fetch_controls = self._is_due("controls", self.control_interval)
            fetch_hazards = self._is_due("hazards", self.hazard_interval)
            self._forced.clear()

            # Whichever half isn't due keeps the list it last returned, so
            # its entities hold their state instead of blinking out between
            # the other half's polls.
            if fetch_controls:
                controls = await self._fetch_controls()
                self._last_fetch["controls"] = monotonic()
                self.last_update["controls"] = dt_util.now()
            else:
                controls = previous.controls if previous else []

            if fetch_hazards:
                hazards = await self._fetch_hazards()
                self._last_fetch["hazards"] = monotonic()
                self.last_update["hazards"] = dt_util.now()
            else:
                hazards = previous.hazards if previous else []

            _LOGGER.debug(
                "%s: %d controls (fetched: %s), %d hazards (fetched: %s)",
                self.displayname, len(controls), fetch_controls,
                len(hazards), fetch_hazards,
            )
            return BlitzerdeAPIData(controls=controls, hazards=hazards)
        except APIConnectionError as err:
            # This will show entities as unavailable by raising UpdateFailed exception
            raise UpdateFailed(f"Error communicating with API: {err}") from err

    async def _query(self, types):
        """One search for the given type codes, area or route as configured."""
        if self.search_mode == SEARCH_MODE_ROUTE:
            return await self._get_route_items(types)
        return await self.api.getArea(
            latitude=self.location['latitude'],
            longitude=self.location['longitude'],
            radius=self.location['radius'],
            types=types,
        )

    async def _fetch_controls(self):
        """Query and filter the controls."""
        types = self.control_types

        if not types and not self.want_archive:
            # Every installation form switched off. Worth having now that an
            # entry can be about hazards alone: asking for an empty type list
            # is answered with 200 and a body that has nothing to do with
            # what was asked, so the request is simply skipped.
            return []

        controls = await self._query(types) if types else []

        if self.want_archive:
            # Appended after the live controls, never merged into their
            # request: the archive is numerous enough to fill a response on
            # its own, and coming last means the configured maximum is spent
            # on current ones before archived ones.
            controls = controls + await self._query(self.archive_types)

        def _keep(item):
            # Both axes. Something this release has no grouping for is kept
            # rather than dropped: a category Blitzer.de adds later should
            # show up and be visible, not disappear silently.
            kind = control_kind(item)
            if kind and not self.kinds.get(kind, True):
                return False
            return self.forms.get(control_form(item), True)

        controls = list(filter(_keep, controls))
        if self.whitelist:
            controls = list(
                filter(
                    lambda item: item['address']['city'].strip().lower() in self.whitelist,
                    controls
                )
            )
        if self.blacklist:
            controls = list(
                filter(
                    lambda item: item['backend'].split("-")[-1] not in self.blacklist,
                    controls
                )
            )
        if self.only_confirmed:
            # Fixed installations have no "confirmed" field at all - they are
            # permanent, not community-reported - so treat them as always
            # confirmed instead of dropping every one of them.
            controls = list(
                filter(
                    lambda item: item_info(item).get('confirmed', 1) == 1,
                    controls
                )
            )
        return controls

    async def _fetch_hazards(self):
        """Query and filter everything that is not a control.

        A request of its own, deliberately not merged into the control one:
        the endpoint answers with at most ~500 entries and in no particular
        order, so a busy area's roadworks quietly push controls out of the
        result. Measured across the Ruhr area - 162 controls when asked for
        alone, 101 of the same 162 once permanent roadworks shared the
        request.

        Skipped entirely while no hazard type is switched on, which is the
        default, so nothing here costs an existing entry a second request.
        """
        if not self.hazard_types:
            return []

        hazards = await self._query(self.hazard_types)

        # .get() rather than indexing throughout: hazards vary far more in
        # shape than controls do. A traffic control centre report has no
        # postcode and sometimes no city, and its "backend" arrives as a
        # number instead of the "<n>-<id>" string every other type sends.
        if self.hazard_whitelist:
            hazards = [
                item for item in hazards
                if (item.get('address') or {}).get('city', '').strip().lower()
                in self.hazard_whitelist
            ]
        if self.hazard_blacklist:
            hazards = [
                item for item in hazards
                if str(item.get('backend', '')).split("-")[-1] not in self.hazard_blacklist
            ]
        return hazards

    def _route_sample_points(self):
        """Interpolate points along the waypoint chain, spaced corridor_width
        apart, so the circular per-point queries below overlap and leave no
        gaps - a "poor man's route search" without a real routing engine.
        Straight lines between waypoints, not actual roads, so a route with
        sharp bends needs waypoints placed on those bends to stay accurate.
        """
        points = [(self.waypoints[0]['latitude'], self.waypoints[0]['longitude'])]
        for start, end in zip(self.waypoints, self.waypoints[1:]):
            segment_length = location_util.distance(
                start['latitude'], start['longitude'], end['latitude'], end['longitude']
            )
            steps = max(1, int(segment_length // self.corridor_width)) if segment_length else 1
            for step in range(1, steps + 1):
                fraction = step / steps
                points.append((
                    start['latitude'] + (end['latitude'] - start['latitude']) * fraction,
                    start['longitude'] + (end['longitude'] - start['longitude']) * fraction,
                ))
        return points

    async def _get_route_items(self, types):
        """Query a circle of radius corridor_width around every sample point
        along the route and merge the results, deduplicated by id.
        """
        controls = []
        seen_backends = set()
        for lat, lng in self._route_sample_points():
            for item in await self.api.getArea(latitude=lat, longitude=lng, radius=self.corridor_width, types=types):
                backend = item['backend']
                if backend not in seen_backends:
                    seen_backends.add(backend)
                    controls.append(item)
        return controls
