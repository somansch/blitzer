from __future__ import annotations

import logging
import re
from math import ceil
from typing import Any

from homeassistant.components.geo_location import GeolocationEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util
from homeassistant.util import location as location_util
from homeassistant.util import slugify

from .const import (
    ARCHIVE_LABEL,
    DOMAIN,
    EVENT_NEW_CONTROL,
    EVENT_NEW_HAZARD,
    HAZARD_ICONS,
    ROUTE_MODES,
    SEARCH_MODE_ROUTE,
)
from .coordinator import (
    BlitzerdeCoordinator,
    control_form,
    code_label,
    control_kind,
    control_label,
    hazard_key,
    hazard_reason,
    is_archive,
    item_info,
    poi_id,
)

_LOGGER = logging.getLogger(__name__)

# By installation form, with the one control kind that has always had a
# recognisable icon of its own overriding it.
_ICONS = {
    "fixed": "mdi:cctv",
    "mobile": "mdi:speedometer",
    "trailer": "mdi:truck-trailer",
    "archive": "mdi:cctv-off",
}
_KIND_ICONS = {
    "redlight": "mdi:traffic-light",
    "redlight_speed": "mdi:traffic-light",
}

# The map's own icon table, ported from its getIconName(). Everything here
# is keyed by the raw type code, because that is what Blitzer.de picks by -
# the four coarse categories cannot tell a tunnel camera from a section
# control from a plain fixed one, and all three used to come out as the
# same picture.
_PICTURE_BY_CODE = {
    "117": "fixed_police_checks",
    "115": "fixed_overtaking",
    "114": "tunnel",
    "113": "sce",
    "111": "fixed_redlight",
    "109": "fixed_height",
    "108": "fixed_weight",
    "105": "fixed_entry",
    "104": "fixed_bus_lane",
    "102": "fixed_dummy",
    "101": "fixed_distance",
    "6": "mobile_distance",
    "2": "mobile_redlight",
}
# The two that take the speed limit as a suffix.
_PICTURE_BY_CODE_WITH_SPEED = {
    "112": "sc_",
    "110": "fixed_redlight_",
}


def _as_number(value):
    """A number from whatever the API put in a field, or None.

    "length" arrives as an int, "lat_end" as a string, and any of them can
    be null - so nothing here may assume a type.
    """
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _tailback_figures(item: dict) -> dict:
    """The two figures Blitzer.de's own popup derives from a tailback.

    Both come straight from the map's code: it prints the delay as
    ceil(delay / 60) minutes, and the speed traffic is actually moving at as
    round(length * 60 * 60 / duration) km/h.

    Roadworks are left out exactly as the map leaves them out - it guards
    both with "type != 22 && type != 26", and a roadwork's length describes
    the works rather than a queue crawling through.
    """
    if str(item.get("type", "")) in ("22", "26"):
        return {}
    info = item_info(item)
    figures = {}
    length = _as_number(info.get("length"))
    duration = _as_number(info.get("duration"))
    if length and duration:
        figures["tailback_speed"] = round(length * 3600 / duration)
    delay = _as_number(info.get("delay"))
    if delay:
        figures["delay_minutes"] = ceil(delay / 60)
    return figures


# What Blitzer.de writes into an address field when it has no name for it,
# rather than leaving it empty: "Straßenname unbekannt" for a road, a bare
# "unbekannt" for a town. Both are rare - three streets across some 1300
# sampled hazards, one town across 840 archive entries - and both are noise
# in a sentence meant to be read.
#
# Only filtered out of the readable line. The "street" and "city"
# attributes keep reporting whatever the API actually sent, because that is
# what they are for.
_STREET_PLACEHOLDERS = ("straßenname unbekannt", "strassenname unbekannt")
_CITY_PLACEHOLDERS = ("unbekannt", "unknown")


# What a road reads like in an official closure's text: a road number at
# the start ("EBE5", "St2081", "A1", "L108"), or a street name - a line, or
# its first word, ending the way German streets do.
_ROAD_NUMBER = re.compile(r"^[A-Z][A-Za-z]{0,2}\s?\d+")
_STREET_ENDINGS = (
    "straße", "strasse", "str.", "weg", "platz", "ring", "allee", "gasse",
    "damm", "brücke", "bruecke", "ufer", "chaussee", "tunnel", "steig", "promenade",
)
_COUNTY_STARTS = ("kreis ", "landkreis ", "stadt ", "kreisfreie stadt ")


def _looks_like_road(line: str) -> bool:
    # "Rheinbrücke Leverkusen - __Vollsperrung (Westring)": the road stands
    # before the dash.
    head = line.split(" - ")[0].strip()
    if _ROAD_NUMBER.match(head):
        return True
    # A street name is short and starts with a capital. "für PKW, LKW,
    # Busse ... über Esmarchstraße, Neustadtstraße" ends like one and is
    # neither; "bis 15.12.2027 22:00 Uhr" starts like a road number and is
    # not one either.
    if len(head) > 60 or not head[:1].isupper():
        return False
    text = head.lower()
    first = text.split(" ", 1)[0]
    return any(text.endswith(end) or first.endswith(end) for end in _STREET_ENDINGS)


def _closure_text_parts(item: dict) -> tuple[str, str, str]:
    """Road, county and the rest of an official closure's text.

    A closure from the Mobilithek arrives without a street or a town - its
    address says no more than the state - and its text is laid out one of a
    few ways: the road and section first, the closure itself, then "Kreis
    X, <road and section>" (Bavaria); a title and the works (NRW); or the
    works, who they affect, and the street last. So the road is whichever
    line reads like one, the county whichever starts like one, and the rest
    is the note. Returns ("", "", whole text) for anything else: a closure
    that has an address, or a text in no known shape.
    """
    reason = hazard_reason(item)
    address = item.get("address") or {}
    if hazard_key(item) != "closure" or address.get("street") or address.get("city"):
        return "", "", reason
    lines = [line.strip() for line in reason.split("\n") if line.strip()]
    if len(lines) < 2:
        return "", "", reason
    road_line = next((line for line in lines if _looks_like_road(line)), "")
    county_line = next((line for line in lines if line.lower().startswith(_COUNTY_STARTS)), "")
    if not road_line:
        return "", "", reason
    # "Rheinbrücke Leverkusen - __Vollsperrung (Westring) beide FR": the
    # road is what stands before the dash, the rest is the closure.
    road = road_line.split(" - ")[0].strip(" _-")
    county = county_line.split(",")[0].strip() if county_line else ""
    rest = [line for line in lines if line not in (road_line, county_line)]
    if road_line != road:
        rest.insert(0, road_line[len(road_line.split(" - ")[0]):].strip(" _-"))
    return road, county, " ".join(part for part in rest if part)


def _place(item: dict) -> str:
    """Street and city in one piece, for the summary line.

    Worth having there rather than only in separate attributes: for an
    accident or a day roadwork it is the only thing the API says at all -
    those arrive with "info" set to a bare false, or to a dict whose length,
    duration and reason are all empty - so without it the line reads just
    "Unfall".

    A traffic control centre report carries its road at the top level
    instead of under "address", and sometimes has no city; both are handled
    by dropping whichever half is missing.
    """
    address = item.get("address") or {}
    street = address.get("street") or item.get("street") or ""
    if street.strip().lower() in _STREET_PLACEHOLDERS:
        street = ""
    city = address.get("city") or ""
    if city.strip().lower() in _CITY_PLACEHOLDERS:
        city = ""
    if not street and not city:
        # An official closure: its road and county, read off its text.
        street, city, _ = _closure_text_parts(item)
    return ", ".join(part for part in (street, city) if part)


def _joined(parts, tail: str = "") -> str:
    """One readable line: the given parts, then any free text after a dash."""
    text = " · ".join(part for part in parts if part)
    if tail:
        return f"{text} — {tail}" if text else tail
    return text


def _hazard_summary(item: dict, language: str, figures: dict) -> str:
    """A hazard in one line, ready to drop into a notification.

    What Blitzer.de calls it, then whatever of the tailback figures it
    actually sent - plenty of them send none - and finally its own free
    text, which on a traffic control centre report is the whole message.
    """
    parts = [code_label(item.get("type"), language)]
    length = _as_number(item_info(item).get("length"))
    if length:
        parts.append(f"{length:g} km")
    if "tailback_speed" in figures:
        parts.append(f"{figures['tailback_speed']} km/h")
    if "delay_minutes" in figures:
        parts.append(f"+{figures['delay_minutes']} min")
    # An official closure's period is not added here: its free text already
    # says "von 21.09.2026 07:30 Uhr bis 30.11.2026 15:00 Uhr", the dates are
    # attributes of their own, and the card reads the last segment of this
    # line as the place - a period there would stand where the road belongs.
    parts.append(_place(item))
    # On an official closure the text's road and county already stand as
    # the place; the note is what is left of the text.
    return _joined(parts, _closure_text_parts(item)[2])


def _control_summary(item: dict, language: str) -> str:
    """A camera in one line: what it is, what it enforces, what it says.

    The last part is the note a fixed camera carries in "info.desc"
    ("Einbahnstr. in Rtg. Velbert, 7-17 Uhr 30 km/h"), which is otherwise
    buried a level down.
    """
    parts = []
    if is_archive(item):
        # Said first, and said at all: an archived report otherwise reads
        # word for word like a camera that is standing there today.
        parts.append(ARCHIVE_LABEL.get((language or "en")[:2].lower(), ARCHIVE_LABEL["en"]))
    parts.append(control_label(item, language))
    vmax = item.get("vmax")
    # A distance check measures the gap between two cars, not their speed.
    # Blitzer.de still fills in the road's own limit there, and printed after
    # the name it reads as what the camera enforces - "Abstandskontrolle ·
    # 100 km/h" says the wrong thing about what is being measured.
    # Only a limit that is one. The old endpoint left a red-light camera's
    # vmax empty or "/"; www.blitzer.de sends "0", which read as "0 km/h".
    # The same rule the map applies when it picks the icon: a number above
    # zero, or nothing.
    try:
        limit = int(vmax)
    except (TypeError, ValueError):
        limit = 0
    if limit > 0 and control_kind(item) != "distance":
        parts.append(f"{limit} km/h")
    parts.append(_place(item))
    return _joined(parts, item_info(item).get("desc") or "")


def _report_distance(hass, coordinator, lat, lng) -> float | None:
    """A report's own distance in the instance's unit, or None before a
    tracker entry has a position."""
    meters = coordinator.report_distance(lat, lng)
    if meters is None:
        return None
    return hass.config.units.length(meters, UnitOfLength.METERS)


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the geolocation platform."""
    coordinator: BlitzerdeCoordinator = hass.data[DOMAIN][
        config_entry.entry_id
    ].coordinator

    registry = er.async_get(hass)
    # Each half names itself in its unique-id prefix, so that neither sync
    # can ever see the other's entities as "no longer reported" and remove
    # them. Both markers sit *before* the display name: put after it, one
    # prefix would be a prefix of the other and the purge below would need a
    # special case to tell them apart. Named this way it needs none.
    control_prefix = f"{DOMAIN}-control-{coordinator.entry_id}-"
    hazard_prefix = f"{DOMAIN}-hazard-{coordinator.entry_id}-"

    def _make_sync(prefix, factory, get_items, event_type, build_payload):
        """Build the add / update / remove pass for one kind of marker.

        Cameras and hazards differ only in which list they read, what they
        turn an item into and what they announce, so they share this.
        """
        known: dict[str, BlitzerdeGeoEvent] = {}
        # Set False after the first sync below - everything reported there is
        # simply "already there" from the entry's very first data fetch, not
        # a new detection, so the "new" event only starts firing from the
        # next poll onwards.
        first_sync = True

        @callback
        def _sync() -> None:
            """Add newly reported items and remove ones no longer in range."""
            nonlocal first_sync
            items = get_items()
            current_ids = {poi_id(item) for item in items}
            new_entities = []
            new_items = []

            for item in items:
                marker_id = poi_id(item)
                if marker_id in known:
                    known[marker_id].update_from_item(item)
                else:
                    entity = factory(coordinator, marker_id, item)
                    known[marker_id] = entity
                    new_entities.append(entity)
                    new_items.append(item)

            # Purge every registry entry of this kind for this area that no
            # longer matches a currently reported item - both ones tracked in
            # `known` this session and leftovers from a previous session.
            # Removing the registry entry directly (synchronously, right
            # here) instead of scheduling entity.async_remove() as a separate
            # task is what makes this immediate: it avoids the brief window
            # where the entity's own (async, task-scheduled) teardown hasn't
            # run yet and Home Assistant shows a "restored: true" /
            # unavailable ghost for it in the meantime.
            for entry in list(
                er.async_entries_for_config_entry(registry, config_entry.entry_id)
            ):
                if entry.domain != "geo_location":
                    continue
                if not entry.unique_id.startswith(prefix):
                    continue
                marker_id = entry.unique_id[len(prefix):]
                if marker_id in current_ids:
                    continue
                known.pop(marker_id, None)
                registry.async_remove(entry.entity_id)

            if new_entities:
                async_add_entities(new_entities)

            if not first_sync:
                for item in new_items:
                    hass.bus.async_fire(event_type, build_payload(item))
            first_sync = False

        return _sync

    def _payload_distance(item: dict):
        # The marker's own figure, rounded the way the marker shows it - so an
        # automation can say "at km 23" on a route or "4.2 km away" in an
        # area without a reference point of its own.
        value = _report_distance(hass, coordinator, item["lat"], item["lng"])
        return round(value, 1) if value is not None else None

    def _control_payload(item: dict) -> dict:
        # The same wording the entity carries, so an automation can print one
        # field instead of assembling six - and can do it straight from the
        # event, without looking the entity up: it is added moments before
        # this fires, but its state is not necessarily written yet.
        language = hass.config.language
        return {
            "config_entry_id": config_entry.entry_id,
            "area": coordinator.displayname,
            "id": poi_id(item),
            "type": control_form(item),
            "kind": control_kind(item),
            # Blitzer.de's own name, as on the entity; the installation is
            # in "type" and in the summary, not here.
            "type_name": code_label(item.get("type"), language),
            "summary": _control_summary(item, language),
            "vmax": item["vmax"],
            "street": (item.get("address") or {}).get("street", ""),
            "city": (item.get("address") or {}).get("city", ""),
            # The rebuilt blitzer.de endpoint drops zip_code from the address
            # (country/city/street only); the old CDN sent it. Absent -> "".
            "zip_code": (item.get("address") or {}).get("zip_code", ""),
            "latitude": item["lat"],
            "longitude": item["lng"],
            "distance": _payload_distance(item),
        }

    def _hazard_payload(item: dict) -> dict:
        address = item.get("address") or {}
        language = hass.config.language
        return {
            "config_entry_id": config_entry.entry_id,
            "area": coordinator.displayname,
            "id": poi_id(item),
            "type": hazard_key(item),
            "type_name": code_label(item.get("type"), language),
            "summary": _hazard_summary(item, language, _tailback_figures(item)),
            "reason": hazard_reason(item),
            "street": address.get("street") or item.get("street") or _closure_text_parts(item)[0],
            "city": address.get("city") or _closure_text_parts(item)[1],
            "zip_code": address.get("zip_code", ""),
            "latitude": item["lat"],
            "longitude": item["lng"],
            "distance": _payload_distance(item),
        }

    sync_controls = _make_sync(
        control_prefix,
        BlitzerdeControlEvent,
        lambda: coordinator.data.controls[: coordinator.controlcount],
        EVENT_NEW_CONTROL,
        _control_payload,
    )
    sync_hazards = _make_sync(
        hazard_prefix,
        BlitzerdeHazardEvent,
        lambda: coordinator.data.hazards[: coordinator.hazardcount],
        EVENT_NEW_HAZARD,
        _hazard_payload,
    )

    @callback
    def _sync_entities() -> None:
        sync_controls()
        sync_hazards()

    coordinator.async_add_listener(_sync_entities)
    _sync_entities()


# Where the symbols come from. The same files as under the old map's
# map.blitzer.de/v5/images/ - every one checked byte for byte on 2026-10-10
# - but served by the site the data itself now comes from.
IMAGE_BASE = "https://www.blitzer.de/karte/images/"

# "2026-10-10 09:25:30" - what www.blitzer.de stamps a report with.
_FULL_STAMP = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?")


def _short_stamp(raw):
    """Blitzer.de's stamp the way its map always showed it: "HH:MM" for a
    report from today, "DD.MM.YYYY" for any other day.

    Through cdn2.atudo.net the endpoint sent exactly that, and everything
    downstream reads it - the card's chips and its "new" marking, the
    counters, the README's templates, and whatever automations people have
    written. www.blitzer.de sends a full "YYYY-MM-DD HH:MM:SS" instead, in
    local time (checked: the old map's "um 09:25" and the new stamp's
    "09:25:30" are the same confirmation). It is folded back into the short
    form here, in one place, so all of that keeps reading what it always
    read; the full stamp is kept beside it, see _full_stamps. Empty stays
    empty: that is what "never confirmed" is now, where the old endpoint put
    01.01.1970.
    """
    if not isinstance(raw, str):
        return raw
    text = raw.strip()
    match = _FULL_STAMP.match(text)
    if not match:
        return text
    year, month, day, hour, minute = (int(part) for part in match.groups()[:5])
    now = dt_util.now()
    if (year, month, day) == (now.year, now.month, now.day):
        return f"{hour:02d}:{minute:02d}"
    return f"{day:02d}.{month:02d}.{year:04d}"


def _full_stamps(item: dict) -> dict:
    """The full stamps as ISO 8601, where the endpoint sent them: for a
    template that wants a real datetime rather than the short form above.
    Only the ones present - an unconfirmed report gets no empty attribute.
    """
    stamps = {}
    for field, attr in (("create_date", "created_at"), ("confirm_date", "confirmed_at")):
        raw = item.get(field)
        match = _FULL_STAMP.match(raw.strip()) if isinstance(raw, str) else None
        if match:
            year, month, day, hour, minute, second = match.groups()
            stamps[attr] = f"{year}-{month}-{day}T{hour}:{minute}:{second or '00'}"
    return stamps


class BlitzerdeGeoEvent(GeolocationEvent):
    """What every marker this integration puts on the map has in common: the
    distance calculation, the per-poll refresh and the registry cleanup.
    What a marker is called, looks like and reports is left to _apply.
    """

    _attr_should_poll = False
    # Every entity of an entry belongs to that entry's device, so Home
    # Assistant renders "<area> <entity>" itself and one area's markers group
    # under one card instead of scattering through the entity list. It is
    # also what makes the display name free of the redundant "Blitzer.de"
    # this used to carry - the integration is already called that.
    _attr_has_entity_name = True

    def __init__(self, coordinator: BlitzerdeCoordinator, poi_id: str, item: dict) -> None:
        self._coordinator = coordinator
        self._poi_id = poi_id
        self._attr_device_info = coordinator.device_info
        self._attr_unit_of_measurement = UnitOfLength.KILOMETERS
        self._extra_attrs: dict[str, Any] = {}
        self._apply(item)

    def _apply(self, item: dict) -> None:
        """Fill in name, position, icon and attributes from one API item."""
        raise NotImplementedError

    @property
    def _language(self) -> str:
        """The instance's language, for the type_name attribute.

        Read from the coordinator rather than self.hass, because _apply runs
        once before the entity is added and has no hass yet.
        """
        return self._coordinator.hass.config.language

    def _distance_from_area_center(self, lat: float, lng: float) -> float | None:
        """Return the distance to the configured reference, instead of
        hass.config.distance()'s home zone: the area's center point in area
        mode, in tracker mode wherever the tracker was when this search was
        made - which is the point these reports were actually found around -
        and in route mode the way along the route from its start to where the
        report lies, so the markers read like a trip: this one at km 3, that
        one at km 23. The same figure the new-report events carry.
        """
        return _report_distance(self.hass, self._coordinator, lat, lng)

    async def async_added_to_hass(self) -> None:
        """Calculate distance once the entity has access to hass.config."""
        self._attr_distance = self._distance_from_area_center(
            self._attr_latitude, self._attr_longitude
        )
        self.async_write_ha_state()

    @callback
    def update_from_item(self, item: dict) -> None:
        """Refresh this entity's state from newly polled data."""
        self._apply(item)
        # A marker is put in the "known" map the moment its entity is built,
        # but the entity only reaches Home Assistant when that batch finishes
        # being added. A second poll in between - two refresh actions almost
        # at once, say - finds it here and would write state before it has a
        # hass, which raises. Its first state lands when it is added anyway,
        # so skip the write until then.
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        """Purge the registry entry so gone markers don't linger as orphans."""
        registry = er.async_get(self.hass)
        if self.entity_id in registry.entities:
            registry.async_remove(self.entity_id)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self._extra_attrs


class BlitzerdeControlEvent(BlitzerdeGeoEvent):
    """Represents a single Blitzer.de speed camera as a geolocation event."""

    def __init__(self, coordinator: BlitzerdeCoordinator, poi_id: str, item: dict) -> None:
        # One source per area *and* half, so a map card can pick any
        # combination through geo_location_sources. Both halves name
        # themselves: the controls used to be the unmarked "blitzer_berlin"
        # against the hazards' "blitzer_berlin_hazards", which read as if
        # one were the whole area and the other an extra.
        self._attr_source = f"{DOMAIN}_{slugify(coordinator.displayname)}_controls"
        self._attr_unique_id = f"{DOMAIN}-control-{coordinator.entry_id}-{poi_id}"
        super().__init__(coordinator, poi_id, item)

    @staticmethod
    def _picture_speed(item: dict) -> str:
        """The speed the map puts in an icon name, or "v" for anything else.

        Exactly the map's own rule: the number when it parses as one above
        zero, and "v" for "?", for "/" and for an empty value alike.
        """
        try:
            return str(item["vmax"]) if int(item["vmax"]) > 0 else "v"
        except (KeyError, TypeError, ValueError):
            return "v"

    @classmethod
    def _picture_path(cls, item: dict) -> str:
        """The symbol Blitzer.de's own map draws for this camera.

        Ported from its getIconName(), which decides by type code first and
        only falls back to a category. Building the name from the category
        alone, as this used to, disagreed with blitzer.de for about a third
        of all cameras in the test data: a combined red light and speed
        camera (110) came out as a plain speed camera, a tunnel camera (114)
        as a generic fixed one, and both halves of a section control
        (112/113) as ordinary cameras.
        """
        info = item_info(item)
        code = str(item.get("type", ""))
        speed = cls._picture_speed(item)

        if is_archive(item):
            # The map's second branch, with its own small marker. 206 is a
            # distance check and 202 a red light one; everything else in the
            # range keeps the speed.
            suffix = {"206": "distance", "202": "redlight"}.get(code, speed)
            return "mobile_archive_" + suffix

        tags = info.get("tags")
        if isinstance(tags, list) and "Chat-Icon" in tags:
            return "chat"
        if str(info.get("partly_fixed", "")) == "1":
            return "ts_" + speed
        if code in _PICTURE_BY_CODE:
            return _PICTURE_BY_CODE[code]
        if code in _PICTURE_BY_CODE_WITH_SPEED:
            return _PICTURE_BY_CODE_WITH_SPEED[code] + speed
        if code.isdigit():
            number = int(code)
            if number < 20:
                return "mobile_" + speed
            if 100 <= number < 199:
                return "fixed_" + speed
        # A code the map has no rule for. Fall back to the form so a future
        # one still gets a picture rather than a 404.
        return f"{control_form(item)}_{speed}"

    def _apply(self, item: dict) -> None:
        # "Kontrolle", matching the section it is configured under and the
        # "Gefahr ..." naming on the other half. Existing entities keep the
        # entity id they were registered with; only what is displayed
        # changes. Installations set up from here on get
        # "geo_location.kontrolle_...".
        # The area's name is the device's, so it is not repeated here: Home
        # Assistant renders the two together.
        self._attr_name = f"Kontrolle {(item.get('address') or {}).get('street', '')}"
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        form = control_form(item)
        kind = control_kind(item)
        self._attr_icon = _KIND_ICONS.get(kind) or _ICONS.get(form, "mdi:map-marker-alert")
        self._attr_entity_picture = (
            IMAGE_BASE + self._picture_path(item) + ".svg"
        )
        if self.hass is not None:
            self._attr_distance = self._distance_from_area_center(item["lat"], item["lng"])
        control_id = item["backend"].split("-")[-1]
        self._extra_attrs = {
            "area": self._coordinator.displayname,
            # How it is installed: mobile, trailer, fixed or archive. This
            # no longer says "redlight" - that answers what is measured, not
            # how the camera is mounted, and now has its own attribute.
            "type": form,
            # What is measured: speed, redlight, section_control, tunnel and
            # so on. The other filtering axis, and the one that used to be
            # invisible - sixteen kinds of fixed installation all read
            # "fixed" and nothing else.
            "kind": kind,
            # What it is, in this instance's language - "Blitzer im Tunnel"
            # rather than the bare category. Neither "type" nor "kind" can
            # say this on its own: both a tunnel camera and a weight check
            # are a fixed installation, and both a section control and a
            # plain speed camera measure speed.
            "type_name": code_label(item.get("type"), self._language),
            # All of the above in one readable line, so a notification or a
            # card can print one field instead of assembling five.
            "summary": _control_summary(item, self._language),
            # The id used in the Blitzer.de map URL
            # (https://www.blitzer.de/karte/?poi=<id>) and for the blacklist
            # config option. Kept as "backend" too for compatibility with
            # dashboards/templates written against earlier versions.
            "id": control_id,
            "backend": control_id,
            "vmax": item["vmax"],
            "counter": item["counter"],
            "city": (item.get("address") or {}).get("city", ""),
            "street": (item.get("address") or {}).get("street", ""),
            # Not sent by the rebuilt blitzer.de endpoint (see above) - "".
            "zip_code": (item.get("address") or {}).get("zip_code", ""),
            # Blitzer.de's stamps the way its map always showed them: either
            # a date or a time of day, never both, a time meaning today -
            # see _short_stamp for where that shape comes from now. A fixed
            # camera's "confirmed" is empty: fixed installations aren't
            # community-reported in the first place.
            "created": _short_stamp(item.get("create_date")),
            "confirmed": _short_stamp(item.get("confirm_date")),
            **_full_stamps(item),
            # The raw "info" object. Small - under 200 bytes across a
            # sampled region - and worth having whole: "desc" carries a
            # fixed camera's written-out note ("Einbahnstr. in Rtg. Velbert,
            # 7-17 Uhr 30 km/h, sonst 50 km/h"), while "label", "quality"
            # and "tags" carry the community's verdict on a mobile one.
            # Anything the API sends here that isn't an object arrives as {}.
            "info": item_info(item),
        }


class BlitzerdeHazardEvent(BlitzerdeGeoEvent):
    """Represents a single non-camera report - a jam, roadworks, an accident,
    a traffic control centre bulletin - as a geolocation event.
    """

    def __init__(self, coordinator: BlitzerdeCoordinator, poi_id: str, item: dict) -> None:
        # The other half's source - see the controls' for why both are named.
        self._attr_source = f"{DOMAIN}_{slugify(coordinator.displayname)}_hazards"
        self._attr_unique_id = f"{DOMAIN}-hazard-{coordinator.entry_id}-{poi_id}"
        super().__init__(coordinator, poi_id, item)

    def _apply(self, item: dict) -> None:
        key = hazard_key(item)
        address = item.get("address") or {}
        # Traffic control centre reports carry the road at the top level as
        # well as in "address"; the community-reported types only in
        # "address", and for an incident on an unnamed stretch not at all.
        street = address.get("street") or item.get("street") or ""
        city = address.get("city") or ""
        if not street and not city:
            # An official closure arrives without an address; its road and
            # county are read off its text, so the entity is named after
            # the road like any other hazard.
            street, city, _ = _closure_text_parts(item)
        self._attr_name = f"Gefahr {street}".strip()
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        self._attr_icon = HAZARD_ICONS.get(key, "mdi:alert")
        # The map's own symbol for this hazard, the same way cameras use
        # theirs - here the type code doubles as the file name.
        self._attr_entity_picture = (
            f"{IMAGE_BASE}{item.get('type')}.svg"
        )
        if self.hass is not None:
            self._attr_distance = self._distance_from_area_center(item["lat"], item["lng"])

        info = item_info(item)
        self._extra_attrs = {
            "area": self._coordinator.displayname,
            "type": key,
            "type_name": code_label(item.get("type"), self._language),
            # Same meaning as on a camera: the id in the map URL, and the one
            # the hazard blacklist matches against.
            "id": self._poi_id,
            "backend": self._poi_id,
            "reason": hazard_reason(item),
            "counter": item.get("counter"),
            "city": city,
            "street": street,
            "zip_code": address.get("zip_code", ""),
            "created": _short_stamp(item.get("create_date")),
            "confirmed": _short_stamp(item.get("confirm_date")),
            **_full_stamps(item),
            # As on a camera: the whole object, next to the individual
            # fields lifted out of it below.
            "info": info,
        }
        # Only the types describing a stretch of road rather than a point
        # report these, so they are added when present instead of always - an
        # accident would otherwise show three permanently empty attributes.
        # "length" is in kilometers, "duration" and "delay" in seconds, as
        # Blitzer.de sends them.
        for attr in ("length", "duration", "delay"):
            if info.get(attr) not in (None, ""):
                self._extra_attrs[attr] = info[attr]

        # An official road closure. Since the move to www.blitzer.de the
        # endpoint carries these from the Mobilithek - Germany's public
        # mobility data - alongside the community's reports: a period rather
        # than a report time, where it came from, and the stretch of road it
        # closes as an encoded polyline, which the card draws as a band.
        # The polyline stays encoded: a few hundred characters the recorder
        # stores once, against dozens of coordinate pairs it would store
        # the same way.
        closure = item.get("closure")
        if isinstance(closure, dict):
            # A closure without a known start is dated 1970-01-01 - the
            # epoch standing in for "unknown", as the old endpoint's
            # "confirmed" did. Empty says that; a chip reading "Since
            # 01/01/1970" would not.
            since = closure.get("since") or ""
            if since.startswith("1970-01-01"):
                since = ""
            self._extra_attrs["closure_since"] = since
            self._extra_attrs["closure_until"] = closure.get("until") or ""
            self._extra_attrs["closure_open_end"] = bool(closure.get("open_end"))
            self._extra_attrs["closure_origin"] = closure.get("origin") or ""
            self._extra_attrs["closure_source"] = item.get("source") or ""
        polyline = item.get("polyline")
        if isinstance(polyline, str) and polyline:
            self._extra_attrs["closure_polyline"] = polyline

        figures = _tailback_figures(item)
        self._extra_attrs.update(figures)
        # Everything above in one readable line - "Stauende · 1 km · 15 km/h
        # · +4 min" - because assembling that from six attributes in a
        # template is exactly the work this can do once.
        self._extra_attrs["summary"] = _hazard_summary(item, self._language, figures)
        # float(), because the API sends these two as strings while it
        # sends "lat"/"lng" as strings the API layer already converts - a
        # template comparing the start and end of a jam would otherwise be
        # comparing a number against text.
        if info.get("lat_end") and info.get("lng_end"):
            try:
                self._extra_attrs["end_latitude"] = float(info["lat_end"])
                self._extra_attrs["end_longitude"] = float(info["lng_end"])
            except (TypeError, ValueError):
                pass
