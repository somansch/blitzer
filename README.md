# Blitzer.de Integration for Home Assistant 🏠

> **Note:** This is a continuation of the original [`hass-blitzerde`](https://github.com/timniklas/hass-blitzerde) integration by [@timniklas](https://github.com/timniklas), whose GitHub account and repository are no longer available. This repository preserves and continues the project so existing users are not left without updates.

## Overview

The Blitzer.de Home Assistant Custom Integration allows you to integrate the Blitzer.de App with your Home Assistant setup.

## Example Markdown Card

Since v1.1.0 each detected camera is exposed as a `geo_location` entity (tagged with `source: blitzer` and an `area` attribute matching the display name you gave the area in the config flow), instead of a fixed pool of `binary_sensor` entities. This also means they show up natively on the [map card](https://www.home-assistant.io/dashboards/map/) via `geo_location_sources: [blitzer]`.

```jinja2
<h1><img src="/local/Blitzer_app.svg" height="23"> Achtung!</h1>
{%- set areas = ["YOUR_AREA_NAME"] %}
{%- set ns = namespace(has_blitzer=false) %}
{%- for area in areas %}
  {%- set matches = namespace(items=[]) %}
  {%- for s in states.geo_location %}
    {%- if state_attr(s.entity_id, 'source') == 'blitzer' and state_attr(s.entity_id, 'area') == area %}
      {%- set matches.items = matches.items + [s.entity_id] %}
    {%- endif %}
  {%- endfor %}
  {%- if matches.items | count > 0 %}
    {%- set ns.has_blitzer = true %}
    <b>{{ area }} ({{ matches.items | count }})</b><br>
    {%- for e in matches.items %}
      {%- set blitzer_counter = state_attr(e, "counter") | int(0) %}
      <img src="{{ state_attr(e, 'entity_picture') }}" width="20">
      <a href="https://map.blitzer.de/v5/ID/{{ state_attr(e, 'backend') }}/">{{ state_attr(e, 'street') }}</a> bei {{ state_attr(e, 'vmax') }} km/h ({{ states(e) }} km)&nbsp;&nbsp;
      {%- for i in range(blitzer_counter) %}
        <img src="https://map.blitzer.de/v5/images/star_full.svg" width="12">
      {%- endfor %}
      {%- for i in range(3-blitzer_counter) %}
        <img src="https://map.blitzer.de/v5/images/star_contour.svg" width="12">
      {%- endfor %}
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

### Using the UI

From the Home Assistant front page, go to **Settings** and then select **Devices & Services** from the list. Use the **Add Integration** button in the bottom right to add a new integration called "Blitzer.de".

## Help and Contribution

If you find a problem, feel free to open an issue and I will do my best to help. If you have something to contribute, your help is greatly appreciated! If you want to add a new feature, please open a pull request first so we can discuss the details.

## Disclaimer

This custom integration is not officially endorsed or supported by Blitzer.de. Use it at your own risk and ensure that you comply with all relevant terms of service and privacy policies.
