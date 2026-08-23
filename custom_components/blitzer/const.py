DOMAIN = "blitzer"

# The two halves this integration reports, used wherever something needs to
# be told apart by half: the coordinator's per-half bookkeeping, the entity
# unique ids, the sensors' attributes. Spelled out here so that adding a
# third one day is a matter of adding it here rather than hunting for the
# places that hardcoded "cameras".
HALF_CONTROLS = "controls"
HALF_HAZARDS = "hazards"
CONF_BLACKLIST = "blacklist"
TYPE_MOBILE = [0,1,2,3,4,5,6]
TYPE_TRAILER = ['ts']
TYPE_FIXED = [101,102,103,104,105,106,107,108,109,110,111,112,113,115,117,114]

# Blitzer.de's archive layer. Its own map calls this "Archiv-Daten": every
# code of 200 and above lands in a separate branch there and is drawn as a
# small secondary marker rather than a full camera pin. 201 is a speed
# camera and 206 a distance check; no other code in that range returned
# anything in any region sampled.
#
# These are not live reports, and are reported as their own category rather
# than mixed in with the current ones. They carry no community data at all
# (their "info" is an empty list), their ids never overlap the cameras
# Blitzer.de reports as current, and roughly a quarter of them sit within
# 50m of one that is - the archived predecessor of a camera still standing.
# Numerous, too: 201 alone fills an entire response around Berlin, which is
# why they are requested separately and appended after the live cameras, so
# that "Maximale Anzahl der Blitzer" spends itself on current ones first.
TYPE_ARCHIVE = [201, 206]
# The one word the readable summary needs that isn't a type name. Without
# it an archived report reads exactly like a live camera - "Speedcamera,
# 100 km/h" - which is the one thing the archive must never be mistaken for.
ARCHIVE_LABEL = {"de": "Archiv", "en": "Archive"}

# Two combinations the type name on its own cannot express. A handheld
# camera, one in a housing and one on a trailer all come back under the same
# type code - "Geschwindigkeitsblitzer" for every one of them - because how a
# control is set up is a separate axis to what it measures. The summary has
# room for exactly one name, and there saying which of the three it is
# carries more than repeating what every speed camera already is. The wording
# is ours: the map's own language files have none for it, since nothing on
# blitzer.de ever combines the two axes into a single label.
FORM_KIND_LABELS = {
    ("mobile", "speed"): {
        "de": "Mobiler Geschwindigkeitsblitzer",
        "en": "Mobile speedcamera",
    },
    ("trailer", "speed"): {
        "de": "Anhängerblitzer",
        "en": "Speedcamera trailer",
    },
}

# Everything Blitzer.de reports that is not a speed camera. The codes and
# their meanings come from the map's own language file
# (https://map.blitzer.de/v5/js/lang_de.js, "txt_type_*"), not from guesswork:
# several of them carry a "vmax" and would otherwise read like speed limits.
#
# Two are not numbers. "closure" is a road block, and "vwd" is a traffic
# control centre report - the latter arrives in a different shape from
# everything else here (no vmax, a fully written-out German traffic bulletin
# in "reason"), which is why the hazard entity reads several fields for it.
#
# Requested in their own API call, never alongside the cameras: the endpoint
# caps a response at ~500 entries, and permanent roadworks alone are numerous
# enough to push cameras out of that budget - measured at 162 cameras alone
# versus 101 once roadworks shared the request.
CONF_HAZARDS = "hazards"
HAZARD_TYPES = {
    "tailback_end": "20",
    "accident": "21",
    "roadwork_temporary": "22",
    "obstacle": "23",
    "slippery": "24",
    "obstructed_view": "25",
    "roadwork_permanent": "26",
    "broken_down_vehicle": "29",
    "closure": "closure",
    "police_report": "vwd",
}
# Off by default, every one of them: an existing entry must not start
# reporting hundreds of roadworks because it was updated.
HAZARD_DEFAULTS = {key: False for key in HAZARD_TYPES}
HAZARD_ICONS = {
    "tailback_end": "mdi:car-brake-alert",
    "accident": "mdi:car-emergency",
    "roadwork_temporary": "mdi:traffic-cone",
    "obstacle": "mdi:alert-octagon",
    "slippery": "mdi:car-traction-control",
    "obstructed_view": "mdi:weather-fog",
    "roadwork_permanent": "mdi:excavator",
    "broken_down_vehicle": "mdi:car-wrench",
    "closure": "mdi:boom-gate",
    "police_report": "mdi:police-badge",
}

# The hazards' own counterparts to CONF_COUNT/CONF_SELECTOR/CONF_BLACKLIST.
# Deliberately separate from the camera ones: a card showing 9 cameras has no
# reason to also cap roadworks at 9, and an id blacklisted as a camera has
# nothing to do with a hazard id.
CONF_HAZARD_COUNT = "hazard_count"
CONF_HAZARD_SELECTOR = "hazard_selector"
CONF_HAZARD_BLACKLIST = "hazard_blacklist"
DEFAULT_HAZARD_COUNT = 9
# Hazards poll on a schedule of their own, with the same meaning and the
# same default as CONF_UPDATE_INTERVAL: minutes, 0 = only ever on demand.
# Separate because the two age very differently - a jam is stale in a
# minute, a permanent roadwork is still there next week - and because each
# one costs its own request.
CONF_HAZARD_UPDATE_INTERVAL = "hazard_update_interval"

# Fired once per hazard that is newly reported for an entry, the same way
# EVENT_NEW_CONTROL is (see geo_location.py's _sync_entities).
EVENT_NEW_HAZARD = f"{DOMAIN}_new_hazard"

# What Blitzer.de itself calls each code, in its own words, lifted from the
# map's language files. Reported as the "type_name" attribute, because the
# coarse category cannot carry it: a tunnel camera, a section control and a
# weight check are all "fixed", and in the test data 98 of 127 cameras were.
CODE_LABELS = {
    "0": {"de": "Unbekannt", "en": "Unknown"},
    "1": {"de": "Geschwindigkeitsblitzer", "en": "Speedcamera"},
    "2": {"de": "Ampelblitzer", "en": "Redlight control"},
    "3": {"de": "Gewichtskontrolle", "en": "Weight control"},
    "4": {"de": "Allg. Verkehrskontrolle", "en": "Spot check on traffic"},
    "5": {"de": "Alkoholkontrolle", "en": "Alcohol control"},
    "6": {"de": "Abstandskontrolle", "en": "Distance control"},
    "7": {"de": "Geschwindigkeitsblitzer", "en": "Speedcamera"},
    "11": {"de": "Ampelblitzer", "en": "Redlight control"},
    "12": {"de": "Section Control", "en": "Section Control"},
    "20": {"de": "Stauende", "en": "End of tailback"},
    "21": {"de": "Unfall", "en": "Accident"},
    "22": {"de": "Tagesbaustelle", "en": "Temporary roadwork"},
    "23": {"de": "Hindernis", "en": "Obstacle"},
    "24": {"de": "Rutschgefahr", "en": "Slipperiness"},
    "25": {"de": "Sichtbehinderung", "en": "Obstructed view"},
    "26": {"de": "Dauerbaustelle", "en": "Permanent roadworks"},
    "29": {"de": "Defektes Fahrzeug", "en": "Broken down vehicle"},
    "101": {"de": "Abstandskontrolle", "en": "Distance control"},
    "102": {"de": "Attrappe", "en": "Dummy"},
    "103": {"de": "Auffahrtskontrolle", "en": "Access control"},
    "104": {"de": "Spurkontrolle", "en": "Lane control"},
    "105": {"de": "Einfahrtskontrolle", "en": "Entrance control"},
    "106": {"de": "Fußgängerüberweg", "en": "Pedestrian crosswalk"},
    "107": {"de": "Geschwindigkeitsblitzer", "en": "Speedcamera"},
    "108": {"de": "Gewichtskontrolle", "en": "Weight control"},
    "109": {"de": "Höhenkontrolle", "en": "Height control"},
    "110": {"de": "Ampel- & Geschwindigkeitsblitzer", "en": "Redlight & speed control"},
    "111": {"de": "Ampelblitzer", "en": "Redlight control"},
    "112": {"de": "Abschnittskontrolle", "en": "Section Control Start"},
    "113": {"de": "Abschnittskontrolle Ende", "en": "Section Control End"},
    "114": {"de": "Blitzer im Tunnel", "en": "Speedcam inside tunnel"},
    "115": {"de": "Überholverbot", "en": "Overtaking ban"},
    "117": {"de": "Stationäre Polizeikontrolle", "en": "Stationary Police Check"},
    "201": {"de": "Geschwindigkeitsblitzer", "en": "Speedcamera"},
    "206": {"de": "Abstandskontrolle", "en": "Distance control"},
    "closure": {"de": "Sperrung", "en": "Road block"},
    "vwd": {"de": "Polizeimeldung", "en": "Police reports"},
}

# The control kinds, i.e. what is actually being measured. This is the axis
# the type section switches on; "type" (mobile / trailer / fixed / archive)
# is the other one, how the thing is installed, and the two combine with AND.
#
# Several codes mean the same control: 1, 7, 107 and 201 are all a speed
# camera, on a tripod, in a housing, or in the archive. Grouping them here
# means a switch says what it does rather than naming a number.
CONF_KINDS = "kinds"
CONTROL_KINDS = {
    "speed": ["1", "7", "107", "201"],
    "redlight": ["2", "11", "111"],
    "redlight_speed": ["110"],
    "section_control": ["12", "112", "113"],
    "tunnel": ["114"],
    "distance": ["6", "101", "206"],
    "weight": ["3", "108"],
    "height": ["109"],
    "lane": ["104"],
    "entry": ["105"],
    "access": ["103"],
    "crosswalk": ["106"],
    "overtaking": ["115"],
    "police": ["4", "117"],
    "alcohol": ["5"],
    "dummy": ["102"],
    "unknown": ["0"],
}
# On by default, all of them: switching the axis on shouldn't be what makes
# an existing entry report less than it did.
KIND_DEFAULTS = {key: True for key in CONTROL_KINDS}
# The same table read the other way, for deciding what an arriving item is.
CODE_KIND = {
    code: kind for kind, codes in CONTROL_KINDS.items() for code in codes
}

# The installation form, the other axis. "redlight" used to live here too,
# which was the mistake this splits up: it answers what is measured, not how
# the camera is mounted, and it is now one of the control kinds above.
TYPE_FORMS = ["mobile", "trailer", "fixed", "archive"]
FORM_DEFAULTS = {"mobile": True, "trailer": True, "fixed": False, "archive": False}

CONF_SEARCH_MODE = "search_mode"
SEARCH_MODE_AREA = "area"
SEARCH_MODE_ROUTE = "route"
CONF_WAYPOINTS = "waypoints"
CONF_CORRIDOR_WIDTH = "corridor_width"
DEFAULT_CORRIDOR_WIDTH = 300

# How often this entry polls Blitzer.de, in minutes. User-configurable per
# entry - 0 means "never automatically", relying entirely on the "refresh"
# service instead (e.g. triggered from an automation). Default of 1 matches
# this integration's previous fixed 60-second interval, so existing entries
# see no behavior change unless the user opts into something different.
CONF_UPDATE_INTERVAL = "update_interval"
DEFAULT_UPDATE_INTERVAL = 1
UPDATE_INTERVAL_MANUAL = 0

# One action per half, named after its half. Two rather than one with a
# parameter, so that each polls exactly what it says: an automation
# refreshing controls for a commute should not spend a request on roadworks,
# and neither should the reverse.
SERVICE_REFRESH_CONTROLS = "refresh_controls"
SERVICE_REFRESH_HAZARDS = "refresh_hazards"
ATTR_CONFIG_ENTRY_ID = "config_entry_id"

# Fired once per control that's newly reported for an entry - never for one
# already known from an earlier poll, and never during the very first sync
# right after setup (those are just "already there", not newly detected).
# See geo_location.py's _sync_entities.
EVENT_NEW_CONTROL = f"{DOMAIN}_new_control"
