from __future__ import annotations

import logging
from math import ceil
from typing import Any

from homeassistant.components.geo_location import GeolocationEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import location as location_util
from homeassistant.util import slugify

from .const import (
    ARCHIVE_LABEL,
    DOMAIN,
    EVENT_NEW_CONTROL,
    EVENT_NEW_HAZARD,
    HAZARD_ICONS,
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
    parts.append(_place(item))
    return _joined(parts, hazard_reason(item))


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
    if vmax not in (None, "", "/", "?") and control_kind(item) != "distance":
        parts.append(f"{vmax} km/h")
    parts.append(_place(item))
    return _joined(parts, item_info(item).get("desc") or "")


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
            "type_name": control_label(item, language),
            "summary": _control_summary(item, language),
            "vmax": item["vmax"],
            "street": item["address"]["street"],
            "city": item["address"]["city"],
            "zip_code": item["address"]["zip_code"],
            "latitude": item["lat"],
            "longitude": item["lng"],
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
            "street": address.get("street") or item.get("street") or "",
            "city": address.get("city", ""),
            "zip_code": address.get("zip_code", ""),
            "latitude": item["lat"],
            "longitude": item["lng"],
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
        """Return the distance to the nearest configured reference point,
        instead of hass.config.distance()'s home zone: the area's center
        point in area mode, or the closest route waypoint in route mode.
        """
        if self._coordinator.search_mode == SEARCH_MODE_ROUTE:
            reference_points = self._coordinator.waypoints
        else:
            reference_points = [self._coordinator.location]

        distances = [
            meters
            for point in reference_points
            if (meters := location_util.distance(point["latitude"], point["longitude"], lat, lng)) is not None
        ]
        if not distances:
            return None
        return self.hass.config.units.length(min(distances), UnitOfLength.METERS)

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
        self._attr_name = f"Kontrolle {item['address']['street']}"
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        form = control_form(item)
        kind = control_kind(item)
        self._attr_icon = _KIND_ICONS.get(kind) or _ICONS.get(form, "mdi:map-marker-alert")
        self._attr_entity_picture = (
            "https://map.blitzer.de/v5/images/" + self._picture_path(item) + ".svg"
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
            # (https://map.blitzer.de/v5/ID/<id>/) and for the blacklist
            # config option. Kept as "backend" too for compatibility with
            # dashboards/templates written against earlier versions.
            "id": control_id,
            "backend": control_id,
            "vmax": item["vmax"],
            "counter": item["counter"],
            "city": item["address"]["city"],
            "street": item["address"]["street"],
            "zip_code": item["address"]["zip_code"],
            # Blitzer.de's own stamps, exactly as it sends them: either a
            # date or a time of day, never both. A time means today. On a
            # fixed camera "confirmed" is usually 01.01.1970 - the epoch,
            # standing in for "never confirmed", since fixed installations
            # aren't community-reported in the first place.
            "created": item.get("create_date"),
            "confirmed": item.get("confirm_date"),
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
        self._attr_name = f"Gefahr {street}".strip()
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        self._attr_icon = HAZARD_ICONS.get(key, "mdi:alert")
        # The map's own symbol for this hazard, the same way cameras use
        # theirs - here the type code doubles as the file name.
        self._attr_entity_picture = (
            f"https://map.blitzer.de/v5/images/{item.get('type')}.svg"
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
            "city": address.get("city", ""),
            "street": street,
            "zip_code": address.get("zip_code", ""),
            "created": item.get("create_date"),
            "confirmed": item.get("confirm_date"),
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
