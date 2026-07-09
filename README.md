# Blitzer.de Integration for Home Assistant 🏠

> **Note:** This is a continuation of the original [`hass-blitzerde`](https://github.com/timniklas/hass-blitzerde) integration by [@timniklas](https://github.com/timniklas), whose GitHub account and repository are no longer available. This repository preserves and continues the project so existing users are not left without updates.

## Overview

The Blitzer.de Home Assistant Custom Integration allows you to integrate the Blitzer.de App with your Home Assistant setup.

## Example Markdown Card

Since v1.1.0 each detected camera is exposed as a `geo_location` entity (with an `area` attribute matching the display name you gave the area in the config flow), instead of a fixed pool of `binary_sensor` entities. This also means they show up natively on the [map card](https://www.home-assistant.io/dashboards/map/).

Since v1.4.0, each configured area gets its **own** `source`, named `blitzer_<area>` (e.g. `blitzer_berlin`, `blitzer_munchen` — the area's display name, lowercased and slugified). This lets you show just one specific area on a map card instead of all of them combined:

```yaml
type: map
geo_location_sources:
  - blitzer_berlin
entities:
  - zone.home
```

Use `geo_location_sources: [all]` (or list every `blitzer_<area>` source) to show all configured areas on the same map.

Since v1.4.0 every camera also carries a `type` attribute — one of `mobile`, `trailer`, `fixed`, or `redlight` — so the card can render each kind appropriately: fixed cameras always report a `counter` of 0 (there's no community confirmation concept for a permanent installation), so showing an empty star rating for them is meaningless; red light cameras don't have a `vmax` speed limit at all.

```jinja2
<h1><img src="/local/Blitzer_app.svg" height="23"> Achtung!</h1>
{%- set areas = ["YOUR_AREA_NAME"] %}
{%- set ns = namespace(has_blitzer=false) %}
{%- for area in areas %}
  {%- set matches = namespace(items=[]) %}
  {%- for s in states.geo_location %}
    {%- if (state_attr(s.entity_id, 'source') or '').startswith('blitzer_') and state_attr(s.entity_id, 'area') == area %}
      {%- set matches.items = matches.items + [s.entity_id] %}
    {%- endif %}
  {%- endfor %}
  {%- if matches.items | count > 0 %}
    {%- set ns.has_blitzer = true %}
    <b>{{ area }} ({{ matches.items | count }})</b><br>
    {%- for e in matches.items %}
      {%- set etype = state_attr(e, 'type') %}
      {%- set blitzer_counter = state_attr(e, "counter") | int(0) %}
      <img src="{{ state_attr(e, 'entity_picture') }}" width="20">
      <a href="https://map.blitzer.de/v5/ID/{{ state_attr(e, 'backend') }}/">{{ state_attr(e, 'street') }}</a>
      {%- if etype == 'redlight' -%}
      &nbsp;Rotlichtblitzer ({{ states(e) }} km)
      {%- else -%}
      &nbsp;bei {{ state_attr(e, 'vmax') }} km/h ({{ states(e) }} km)
      {%- endif -%}
      {%- if etype == 'fixed' -%}
      &nbsp;<i>(fest installiert)</i>
      {%- elif etype != 'redlight' -%}
      &nbsp;&nbsp;
      {%- for i in range(blitzer_counter) %}
        <img src="https://map.blitzer.de/v5/images/star_full.svg" width="12">
      {%- endfor %}
      {%- for i in range(3-blitzer_counter) %}
        <img src="https://map.blitzer.de/v5/images/star_contour.svg" width="12">
      {%- endfor %}
      {%- endif %}
      <br>
    {%- endfor %}
  {%- endif %}
{%- endfor %}
{%- if not ns.has_blitzer %}
  <div style="text-align:center; opacity:0.7;">Aktuell keine Blitzer 🚗💨</div>
{%- endif %}
```

## Installation

### HACS (recommended)

This integration is available in HACS (Home Assistant Community Store) as a custom repository.

1. Install HACS if you don't have it already
2. Open HACS in Home Assistant
3. Go to any of the sections (integrations, frontend, automation)
4. Click on the 3 dots in the top right corner
5. Select "Custom repositories"
6. Add the following URL to the repository: `https://github.com/somansch/blitzer`
7. Select "Integration" as category
8. Click the "ADD" button
9. Search for "Blitzer.de"
10. Click the "Download" button

### Manual

To install this integration manually, download `blitzer.zip` from the [latest release](https://github.com/somansch/blitzer/releases/latest) and extract its contents to the `config/custom_components/blitzer` directory:

```bash
mkdir -p custom_components/blitzer
cd custom_components/blitzer
wget https://github.com/somansch/blitzer/releases/latest/download/blitzer.zip
unzip blitzer.zip
rm blitzer.zip
```

## Configuration

### Adding an area

From the Home Assistant front page, go to **Settings** and then select **Devices & Services** from the list. Use the **Add Integration** button in the bottom right, search for "Blitzer.de" and add it. You can add the integration multiple times to track several areas (e.g. "München", "Berlin") — each one becomes its own config entry with its own entities.

| Field | Description |
|---|---|
| **Anzeigename / Display name** | Freely chosen name for this area. Used as a suffix in entity names and IDs (e.g. `sensor.blitzer_blitzer_<name>_total`), and as the `area` attribute on every `geo_location` entity it creates. |
| **Bereich / Section** | Drag the map to the center point you want to monitor and adjust the radius circle. All cameras within this radius are reported. |
| **Blitzer / Types** – Mobile | Include mobile/handheld speed traps. |
| **Blitzer / Types** – Anhänger / Trailer | Include trailer-mounted (semi-stationary) speed traps. |
| **Blitzer / Types** – Feste / Fixed | Include permanently installed fixed speed cameras. |
| **Optionale Einstellungen / Optional settings** – Anzahl der Sensoren / Number of sensors | Upper limit on how many cameras are tracked at once (default 9). Extra hits beyond this number are ignored. |
| **Optionale Einstellungen / Optional settings** – Regex Filter der Städtenamen / Regex filter of city names (whitelist) | Only cameras whose city matches this regex are kept (default `.*`, i.e. no filtering). |
| **Optionale Einstellungen / Optional settings** – Nur bestätigte Blitzer anzeigen / Only show confirmed | When enabled, only cameras the Blitzer.de community has confirmed recently are reported. |
| **Optionale Einstellungen / Optional settings** – Blacklist | Comma-separated list of camera IDs to always exclude, regardless of the whitelist regex (e.g. `120644,167589`). The ID is the number from the camera's `id`/`backend` attribute, which is also the same number used in its `https://map.blitzer.de/v5/ID/<id>/` URL. Use this for specific cameras you want to ignore (e.g. false positives or ones you're just not interested in), as opposed to the whitelist, which filters by city name via regex. |

### Changing settings later

Every field above (including the area's location/radius and the sensor count) can be changed afterwards: go to **Settings → Devices & Services**, find the "Blitzer.de" entry for the area you want to change, and click **Configure**. The form opens pre-filled with that area's current settings.

## Help and Contribution

If you find a problem, feel free to open an issue and I will do my best to help. If you have something to contribute, your help is greatly appreciated! If you want to add a new feature, please open a pull request first so we can discuss the details.

## Disclaimer

This custom integration is not officially endorsed or supported by Blitzer.de. Use it at your own risk and ensure that you comply with all relevant terms of service and privacy policies.
