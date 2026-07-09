# Changelog

All notable changes to this integration are documented here.

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
