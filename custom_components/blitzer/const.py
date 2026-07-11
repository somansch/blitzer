DOMAIN = "blitzer"
CONF_BLACKLIST = "blacklist"
TYPE_MOBILE = [0,1,2,3,4,5,6]
TYPE_TRAILER = ['ts']
TYPE_FIXED = [101,102,103,104,105,106,107,108,109,110,111,112,113,115,117,114]

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

SERVICE_REFRESH = "refresh"
ATTR_CONFIG_ENTRY_ID = "config_entry_id"
