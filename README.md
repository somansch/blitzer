# Blitzer.de Integration for Home Assistant 🏠

> **Note:** This is a continuation of the original [`hass-blitzerde`](https://github.com/timniklas/hass-blitzerde) integration by [@timniklas](https://github.com/timniklas), whose GitHub account and repository are no longer available. This repository preserves and continues the project so existing users are not left without updates.

## Overview

The Blitzer.de Home Assistant Custom Integration allows you to integrate the Blitzer.de App with your Home Assistant setup.

## Example Markdown Card

```jinja2
<h1><img src="/local/Blitzer_app.svg" height="23"> Achtung!</h1>
{%- set sensor_names = ["YOUR_SENSOR_NAME"] %}
{%- for city in sensor_names %}
  {%- set anzahl_aktuelle_warnungen = states("sensor.blitzer_blitzer_"~city~"_total") | int(0) %}
  {%- if anzahl_aktuelle_warnungen > 0 %}
    {%- set blitzer_name = state_attr("binary_sensor.blitzer_blitzer_"~city~"_map1", "friendly_name")[0:-1] %}
    <b>{{blitzer_name}} ({{anzahl_aktuelle_warnungen}})</b><br>
    {%- for i in range(int(anzahl_aktuelle_warnungen)) %}
      {%- set blitzer_backend = state_attr("binary_sensor.blitzer_blitzer_"~city~"_map"~loop.index, "backend") %}
      {%- set blitzer_vmax = state_attr("binary_sensor.blitzer_blitzer_"~city~"_map"~loop.index, "vmax") %}
      {%- set blitzer_street = state_attr("binary_sensor.blitzer_blitzer_"~city~"_map"~loop.index, "street") %}
      {%- set blitzer_counter = state_attr("binary_sensor.blitzer_blitzer_"~city~"_map"~loop.index, "counter") %}
      {%- set blitzer_image = state_attr("binary_sensor.blitzer_blitzer_"~city~"_map"~loop.index, "entity_picture") %}
      <img src="{{blitzer_image}}" width="20">
      <a href="https://map.blitzer.de/v5/ID/{{blitzer_backend}}/">{{blitzer_street}}</a> bei {{blitzer_vmax}} km/h&nbsp;&nbsp;
      {%- for i in range(int(blitzer_counter)) %}
        <img src="https://map.blitzer.de/v5/images/star_full.svg" width="12">
      {%- endfor %}
      {%- for i in range(3-int(blitzer_counter)) %}
        <img src="https://map.blitzer.de/v5/images/star_contour.svg" width="12">
      {%- endfor %}
      <br>
    {%- endfor %}
  {%- endif %}
{%- endfor %}
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
