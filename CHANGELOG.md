# Changelog

All notable changes to this integration are documented here.

## v1.6.1

### Added
- Each camera's `geo_location` entity now sets a proper MDI icon per type (`mdi:cctv` fixed, `mdi:speedometer` mobile, `mdi:truck-trailer` trailer, `mdi:traffic-light` red light), matching the sibling `lufop_radar` integration. The map card still shows the existing Blitzer.de speed-sign picture, but the icon now shows correctly wherever `entity_picture` isn't used (entity list, history, more-info dialog).

## v1.6.0

### Added
- New **Route (waypoints)** search mode, alongside the existing area/radius search. Choose "Suchart" when adding an entry: draw a route as a chain of map-based waypoints (one screen per point, same drag-the-map interaction as the radius picker) and set a corridor width; cameras are searched along straight-line segments between waypoints without any external routing engine, by sampling and querying points spaced one corridor-width apart and deduplicating the merged results by camera id. A route's `geo_location` entities report distance to the nearest waypoint rather than a single area center.
- A route's waypoints have no upper limit, and editing a route via **Configure** now offers a choice up front: step through each already-saved waypoint to reposition or remove it (then append further new ones), or jump straight to the corridor width / camera types / optional settings without touching the waypoints at all — it no longer discards and redraws the whole route from scratch, and no longer forces you through every waypoint just to change an unrelated setting.
- Multi-step forms (waypoint entry/review, the search-mode picker) now show a "Next" button instead of the generic submit label, since more steps always follow.

### Changed
- **Breaking**: The whitelist option is now a comma-separated list of city names (same syntax as the blacklist, e.g. `Berlin,Potsdam`), matched case-insensitively, instead of a regex pattern. Existing entries still using the old default (`.*`) keep working unchanged (treated as "no filter"); anyone who configured an actual regex needs to replace it with a plain city list via **Configure**.

### Fixed
- Adding a new area or route showed a completely blank form on the second step: the location/map selector field had no explicit default, which the frontend can only tolerate on a flow's very first step (`Selector location not supported in initial form data`). Every location field on a later step now gets an explicit default.
- Adding waypoints to a route silently stopped being possible after the 3rd one for anyone who didn't notice the "Add another waypoint" checkbox had defaulted to unchecked once the 2-waypoint minimum was reached; it now always defaults to checked.
- Clearing the whitelist or blacklist field back to empty didn't stick: the frontend strips an empty *optional* text field from the submitted data entirely, so the schema silently re-applied its default (the previously saved value) instead of actually saving empty. Both fields now use `description={"suggested_value": ...}` to pre-fill the current value instead of a hard schema `default=`, which is not re-applied on submit — and unlike making the fields `Required`, still allows submitting them empty in the first place. The whitelist field also no longer keeps displaying the legacy `.*` value on existing entries — it's now shown (and treated) as empty, matching what it actually means.

## v1.5.0

### Added
- New **Rotlicht / Red light** type option, independent of "Feste / Fixed". Red light cameras have no API category of their own — they're regular "fixed" cameras (type codes 101-117) with no speed limit — so this is filtered client-side after fetching, and can be toggled independently (e.g. fixed off + red light on shows only red light cameras).
- The example markdown card now sorts cameras by distance to the area's center point, closest first.

## v1.4.0

### Added
- Each configured area now gets its own `geo_location` `source` (`blitzer_<area>`, e.g. `blitzer_berlin`) instead of one shared `blitzer` source for every area, so a map card can select just one specific area via `geo_location_sources` instead of always showing them all combined.
- Every camera now carries a `type` attribute (`mobile` / `trailer` / `fixed` / `redlight`), and an `id` attribute (the numeric id used in the camera's `https://map.blitzer.de/v5/ID/<id>/` URL — also still available as `backend` for compatibility). The example markdown card uses `type` to hide the (meaningless) speed limit for red light cameras and the (always-empty) star rating for fixed cameras, showing "(fest installiert)" instead.
- New **Blacklist** config option: a comma-separated list of camera IDs to always exclude, on top of the existing whitelist (which filters by city name via regex). Useful for excluding specific false positives or cameras you're not interested in that a regex can't target.

### Fixed
- The example markdown card had inconsistent spacing around "bei ... km/h" / "Rotlichtblitzer" due to Jinja whitespace-trimming eating the literal space in the template text; it now uses explicit `&nbsp;` so the spacing is stable regardless of trimming.

## v1.3.0

### Fixed
- **Setup error when enabling "Feste Blitzer" (fixed cameras)**: fixed speed cameras don't carry a `confirmed` field from the Blitzer.de API (they're permanent installations, not community-reported), but the "only show confirmed" filter accessed it unconditionally and crashed with a `KeyError`, failing the whole config entry. It now defaults to treating cameras without that field as confirmed.
- **Stale "orphan" entities lingering as `unavailable` / `restored: true`**: cameras that disappear from the API are now purged from the entity registry immediately and synchronously as soon as a poll detects they're gone, instead of via a separately scheduled task. Note that detection itself is still bound by the 60-second poll interval — a camera can only be noticed as gone at the next poll, not the instant it actually disappears from Blitzer.de's data.
- **Wrong/broken icon for red light cameras** (e.g. `vmax` reported as "redlight"): the code compared the decoded value against the raw JSON-escaped string `"\/"`, which JSON decoding already turns into a plain `"/"` before it reaches Python — so the comparison never matched and produced a broken image URL (`fixed_/.svg`). Red light cameras now correctly resolve to `fixed_redlight.svg` / `mobile_redlight.svg`.

## v1.2.0

### Fixed
- `geo_location` distance is now computed from the configured area's center point (the location you pick in the config flow) instead of `hass.config.distance()`'s Home Assistant home zone.
- Options flow: the location selector had no default value, so editing an existing area always reset the map to the home zone instead of showing its saved coordinates/radius.
- The sensor count (`Anzahl der Sensoren`) was missing from the options form entirely and could not be changed after initial setup; it's now editable like every other setting.

### Added
- Local brand icon (`custom_components/blitzer/brand/icon.png`), served via the brands proxy API (HA 2026.3+) so the integration shows a proper icon in the UI instead of a placeholder.
- README now documents every config flow / options field.

## v1.1.0

### Changed
- Individual speed cameras are now exposed as `geo_location` entities (dynamically added/removed per physical camera, keyed by a stable id from the API) instead of a fixed pool of indexed `binary_sensor` entities. This means:
  - Markers no longer "jump" between physical locations as results change between polls.
  - Cameras show up natively on the [map card](https://www.home-assistant.io/dashboards/map/) via `geo_location_sources: [blitzer]`.
  - Stale entities for cameras no longer reported are cleaned up from the entity registry.

### Fixed
- `lat`/`lng` values from the Blitzer.de API were left as strings, which silently broke any code doing math on them (e.g. distance calculations, cluster resolution).

## v1.0.0

Initial release: continuation of the archived [`hass-blitzerde`](https://github.com/timniklas/hass-blitzerde) integration by [@timniklas](https://github.com/timniklas).
