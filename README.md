# Blitzer.de Integration for Home Assistant 🏠

[![GitHub release](https://img.shields.io/github/v/release/somansch/blitzer)](https://github.com/somansch/blitzer/releases/latest)
[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/default)
[![License](https://img.shields.io/github/license/somansch/blitzer)](https://github.com/somansch/blitzer/blob/main/LICENSE)

> **Note:** This is a continuation of the original [`hass-blitzerde`](https://github.com/timniklas/hass-blitzerde) integration by [@timniklas](https://github.com/timniklas), whose GitHub account and repository are no longer available. This repository preserves and continues the project so existing users are not left without updates.

## Overview

For any area or route you configure - a center point + radius, or a hand-drawn route for something like a daily commute - Blitzer.de reports nearby speed cameras as `geo_location` entities, so they show up natively on Home Assistant's built-in [map card](https://www.home-assistant.io/dashboards/map/), each with distance, street name, speed limit, and camera type.

**Features:**
- **Config flow** - add as many areas or routes as you like (e.g. "Munich", "Berlin", "Commute"), each with its own entities.
- **Native `geo_location` entities**, fully compatible with the map card.
- **Per-entry map sources** (`blitzer_<name>`) so you can show just one area, or all of them combined.
- **Camera type attribute**: `mobile`, `trailer`, `fixed`, `redlight`.
- **Fine-grained filtering**: camera types, city whitelist (comma-separated city names), "confirmed only", camera ID blacklist, and a configurable sensor limit.
- **Route mode** - draw a corridor along a chain of map waypoints instead of a radius, no external routing engine needed; waypoints can be repositioned or removed later without redrawing the whole route.

There's also a ready-to-use Markdown card template below for a compact "cameras near you" dashboard list.

Questions, feedback, or just want to see what others are doing with it? Join the discussion on the [Home Assistant Community thread](https://community.home-assistant.io/t/blitzer-de-integration-speed-camera-for-germany/1016805).

## Dashboard Examples

Each detected camera is exposed as a `geo_location` entity, with an `area` attribute matching the display name you gave the area in the config flow. This also means they show up natively on the [map card](https://www.home-assistant.io/dashboards/map/).

### Map card

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/map-card-example.png" alt="Map card showing Blitzer.de cameras around Berlin" width="500">

Each configured area gets its **own** `source`, named `blitzer_<area>` (e.g. `blitzer_berlin`, `blitzer_munchen` — the area's display name, lowercased and slugified). This lets you show just one specific area on a map card instead of all of them combined:

<details>
<summary>YAML</summary>

```yaml
type: map
geo_location_sources:
  - blitzer_berlin
entities:
  - zone.home
```

</details>

Use `geo_location_sources: [all]` (or list every `blitzer_<area>` source) to show all configured areas on the same map.

### Markdown card

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/markdown-card-example.png" alt="Markdown card listing Berlin cameras sorted by distance" width="500">

The list is sorted by distance to the area's center point, closest first.

<details>
<summary>YAML</summary>

```jinja2
<h1></h1>
{%- set areas = ["Berlin"] -%}
{%- set ns = namespace(has_blitzer=false) -%}
{%- for area in areas -%}
{%- set matches = namespace(items=[]) -%}
{%- for s in states.geo_location -%}
{%- if (state_attr(s.entity_id, 'source') or '').startswith('blitzer_') and state_attr(s.entity_id, 'area') == area -%}
{%- set matches.items = matches.items + [{'id': s.entity_id, 'dist': states(s.entity_id) | float(9999)}] -%}
{%- endif -%}
{%- endfor -%}
{%- set sorted_items = matches.items | sort(attribute='dist') -%}
{%- if sorted_items | count > 0 -%}
{%- set ns.has_blitzer = true -%}
<b>{{ area }} ({{ sorted_items | count }})</b><br>
{%- for m in sorted_items -%}
{%- set e = m.id -%}
{%- set etype = state_attr(e, 'type') -%}
{%- set counter = state_attr(e, 'counter') | int(0) -%}
<img src="{{ state_attr(e, 'entity_picture') }}" width="20">
<a href="https://map.blitzer.de/v5/ID/{{ state_attr(e, 'backend') }}/">{{ state_attr(e, 'city') }}, {{ state_attr(e, 'street') }}</a>
{%- if etype == 'redlight' -%}
&nbsp;Rotlichtblitzer ({{ states(e) }} km)
{%- else -%}
&nbsp;bei {{ state_attr(e, 'vmax') }} km/h ({{ states(e) }} km)
{%- endif -%}
{%- if etype == 'fixed' -%}
&nbsp;<i>(fest installiert)</i>
{%- elif etype != 'redlight' -%}
&nbsp;&nbsp;
{%- for _ in range(counter) -%}
<img src="https://map.blitzer.de/v5/images/star_full.svg" width="12">
{%- endfor -%}
{%- for _ in range(3 - counter) -%}
<img src="https://map.blitzer.de/v5/images/star_contour.svg" width="12">
{%- endfor -%}
{%- endif -%}
<br>
{%- endfor -%}
{%- endif -%}
{%- endfor -%}

{%- if not ns.has_blitzer -%}
<div style="text-align:center; opacity:0.7;">
  Aktuell keine Blitzer 🚗💨
</div>
{%- endif -%}
```

</details>

## Automations

### Notify when a new camera is reported

#### New cameras anywhere in the integration's configured area/route

Every area/route fires a **`blitzer_new_camera`** event the moment a genuinely new camera is detected on one of its polls (or an on-demand `blitzer.refresh`) - never for a camera already known from an earlier poll, and never right after Home Assistant starts (that first fetch is just "here's what's already there", not a new detection). Trigger an automation directly off it, no zone setup required:

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Neuer Blitzer gemeldet"
    triggers:
      - trigger: event
        event_type: blitzer_new_camera
        event_data:
          area: Berlin
    actions:
      - action: notify.mobile_app_dein_handy
        data:
          message: >-
            Neuer Blitzer: {{ trigger.event.data.street }},
            {{ trigger.event.data.city }}
            ({{ trigger.event.data.vmax }} km/h)
```

</details>

The event's data includes `config_entry_id`, `area`, `id` (the ID used in the Blitzer.de map URL), `type` (`mobile`/`trailer`/`fixed`/`redlight`), `vmax`, `street`, `city`, `zip_code`, `latitude`, and `longitude`. Drop the `event_data: area: ...` filter to match every configured area/route instead of just one. Since it's a plain event (not tied to an entity), the data is read from `trigger.event.data.*`.

#### New cameras entering a defined zone

Want a proximity-based notification instead - e.g. only once a camera is inside your home zone, regardless of when it was first detected? Every camera is also a `geo_location` entity ([see "Created entities"](#created-entities)), so Home Assistant's built-in [geolocation trigger](https://www.home-assistant.io/docs/automation/trigger/#zone-trigger) works too:

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Neuer Blitzer in Zone"
    trigger:
      - platform: geolocation
        source: blitzer_berlin
        zone: zone.home
        event: enter
    action:
      - service: notify.mobile_app_dein_handy
        data:
          message: >-
            Neuer Blitzer: {{ state_attr(trigger.entity_id, 'street') }},
            {{ state_attr(trigger.entity_id, 'city') }}
            ({{ state_attr(trigger.entity_id, 'vmax') }} km/h)
```

</details>

Since a stationary (`fixed`/`trailer`) camera's position never changes after creation, "entering the zone" effectively only happens once, right when that camera is first created - a similar end result to the event above for that case, but scoped to the zone's own radius rather than the whole configured area, and requiring a zone that overlaps the area you actually care about. It also naturally covers a `mobile` camera's occasional position updates, which the event does not (that only fires once, on first detection). Since it's tied to an entity, the data is read from `state_attr(trigger.entity_id, '...')`.

### On-demand refresh for a commute

Every area/route has an **Update interval** (see the tables above); setting it to **0** turns off automatic polling entirely, so it only ever refreshes when *you* ask it to - via the **`blitzer.refresh`** action ("Blitzer Refresh" in the UI). Call it targeting the area/route you want, and it immediately fetches the latest cameras, creates/updates/removes that entry's `geo_location` entities exactly like a normal scheduled poll would, and (optionally) returns the cameras found so an automation can use them directly.

A common use case: a route for your commute, set to manual-only, refreshed and sent to your phone the moment you actually leave home - instead of polling every minute all day for a route you only drive once or twice:

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Send commute cameras when leaving home"
    triggers:
      - trigger: zone
        entity_id: person.your_name
        zone: zone.home
        event: leave
    actions:
      - action: blitzer.refresh
        data:
          config_entry_id: YOUR_ROUTE_CONFIG_ENTRY_ID
        response_variable: commute_cameras
      - action: notify.whatsapp   # whichever WhatsApp notify service you have set up (e.g. a CallMeBot or Twilio integration) - not a built-in Home Assistant service
        data:
          message: >-
            {% if commute_cameras.cameras %}
            🚨 {{ commute_cameras.cameras | count }} camera(s) on your commute:
            {% for c in commute_cameras.cameras %}
            - {{ c.city }}, {{ c.street }}{% if c.vmax not in (None, '/', '?') %} ({{ c.vmax }} km/h){% endif %}
            {% endfor %}
            {% else %}
            No cameras currently reported on your commute. Safe drive!
            {% endif %}
```

</details>

Find `YOUR_ROUTE_CONFIG_ENTRY_ID` under **Settings → Devices & Services**, click the "Blitzer.de" integration, open the route's entry, and copy its ID from the browser's URL - or just build the action once in **Developer Tools → Actions**, picking the route from the "Area or route" dropdown, then switch to YAML mode there to copy the resolved `config_entry_id`.

## Configuration

### Adding an area

From the Home Assistant front page, go to **Settings** and then select **Devices & Services** from the list. Use the **Add Integration** button in the bottom right, search for "Blitzer.de" and add your first area. The integration itself is only added once — to track additional areas (e.g. both "München" and "Berlin"), open the already-added "Blitzer.de" integration card and use its own **Add entry** option to create another entry, one per area, each with its own entities.

After naming the entry, pick a **search mode / Suchart**:

- **Area (radius) / Bereich (Radius)** — the classic mode: one center point plus a radius circle.
- **Route (waypoints) / Route (Wegpunkte)** — search a corridor along a hand-drawn route instead (see below).

#### Area (radius)

| Field | Description |
|---|---|
| **Display name / Anzeigename** | Freely chosen name for this area. Used as a suffix in entity names and IDs (e.g. `sensor.blitzer_blitzer_<name>_total`), and as the `area` attribute on every `geo_location` entity it creates. |
| **Section / Bereich** | Drag the map to the center point you want to monitor and adjust the radius circle. All cameras within this radius are reported. |
| **Types** – Mobile | Include mobile/handheld speed traps. |
| **Types** – Trailer / Anhänger | Include trailer-mounted (semi-stationary) speed traps. |
| **Types** – Fixed / Feste | Include permanently installed fixed speed cameras. |
| **Types** – Red light / Rotlichtampel | Include red light cameras (traffic signal enforcement). |
| **Optional settings / Optionale Einstellungen** – Only show confirmed / Nur bestätigte Blitzer anzeigen | When enabled, only cameras the Blitzer.de community has confirmed recently are reported. |
| **Optional settings / Optionale Einstellungen** – Number of sensors / Maximale Anzahl der Blitzer | Upper limit on how many cameras are tracked at once (default 9). Extra hits beyond this number are ignored. |
| **Optional settings / Optionale Einstellungen** – Update interval (minutes, 0 = manual only) / Aktualisierungsintervall (Minuten, 0 = nur manuell) | How often this area polls Blitzer.de. Defaults to 1 minute, matching this integration's previous fixed behavior; **0** disables automatic polling entirely - use the [`blitzer.refresh` service](#on-demand-refresh-for-a-commute) instead. |
| **Optional settings / Optionale Einstellungen** – Whitelist (comma-separated city names) / Whitelist (kommagetrennte Städtenamen) | Comma-separated list of city names to keep, case-insensitive exact match (e.g. `Berlin,Potsdam`). Empty (the default) means no filtering — every city is kept. |
| **Optional settings / Optionale Einstellungen** – Blacklist | Comma-separated list of camera IDs to always exclude, regardless of the whitelist (e.g. `120644,167589`). The ID is the number from the camera's `id`/`backend` attribute, which is also the same number used in its `https://map.blitzer.de/v5/ID/<id>/` URL. Use this for specific cameras you want to ignore (e.g. false positives or ones you're just not interested in), as opposed to the whitelist, which filters by city name. |

#### Route (waypoints)

For a commute or a regular trip, "area" search would need an impractically large radius. Route mode instead lets you draw the route as a chain of waypoints, one map at a time — the same drag-the-map interaction as the area's radius picker, just repeated per point instead of one point plus a circle:

1. Move the map to your route's starting point, then leave **Add another waypoint** checked and continue — one map screen per waypoint.
2. Add a waypoint at every place the route bends noticeably. Cameras are searched in a corridor along the *straight* line between consecutive waypoints, not along actual roads (there's no routing engine involved), so a long straight line across a curve will miss cameras on the curve or search too widely off to the side.
3. Uncheck **Add another waypoint** once you've placed the last one (at least 2 total).
4. Set the **Corridor width (meters) / Korridorbreite (Meter)** — how far to each side of the route line to search (default 300 m) — plus the same camera-type and optional-settings fields as area mode (including **Update interval**, above).

Internally, the integration interpolates extra sample points along each straight segment (spaced one corridor-width apart) and queries Blitzer.de around every one of them, then merges and deduplicates the results by camera id.

Editing a route via **Configure** first asks **what to edit**:

- **Edit waypoints** — steps you through every already-saved waypoint one at a time (move the map to reposition it, or check **Remove this waypoint** to drop it), then lets you append further new waypoints to the end. The route isn't discarded and redrawn from scratch.
- **Edit search settings** — jumps straight to corridor width, camera types, and the optional settings, without touching the waypoints at all.

Every field above can be changed afterwards: go to **Settings → Devices & Services**, find the entry for the area you want to change, and click **Configure**. The form opens pre-filled with that area's current settings.

### Created entities

Each area or route produces the following entities:

| Entity | Example ID | Description |
|---|---|---|
| Total count sensor | `sensor.blitzer_blitzer_<name>_total` | Number of currently reported cameras (capped at "Number of sensors"). Its attributes break the count down per city. |
| One `geo_location` entity per camera | `geo_location.blitzer_<name>_<street>` | Created and removed dynamically as cameras appear and disappear from the live data — there's no fixed pool of entities. |

Attributes on each camera's `geo_location` entity:

| Attribute | Description |
|---|---|
| `state` | Distance in km (or miles) to the nearest reference point — the area's center point in area mode, or the nearest of the route's waypoints in route mode. |
| `source` | `blitzer_<area>`, e.g. `blitzer_berlin`. Lets a map card select one specific area via `geo_location_sources`. |
| `area` | The display name you gave this area. |
| `type` | One of `mobile`, `trailer`, `fixed`, or `redlight`. |
| `id` / `backend` | The camera's numeric Blitzer.de ID — the same number used in its `https://map.blitzer.de/v5/ID/<id>/` URL and in the blacklist option. |
| `vmax` | Speed limit at this location, in km/h (or `/` for red light cameras, `?` if unknown). |
| `counter` | Number of community confirmations (always `0` for fixed cameras). |
| `city`, `street`, `zip_code` | Address of the camera. |
| `entity_picture` | Icon URL matching the camera's type and speed. |

## Installation

### HACS (recommended)

Blitzer.de is part of the default HACS integration list:

1. Open HACS in Home Assistant
2. Search for "Blitzer.de"
3. Click the "Download" button
4. Restart HA

### Manual

To install this integration manually, download `blitzer.zip` from the [latest release](https://github.com/somansch/blitzer/releases/latest) and extract its contents to the `config/custom_components/blitzer` directory:

```bash
mkdir -p custom_components/blitzer
cd custom_components/blitzer
wget https://github.com/somansch/blitzer/releases/latest/download/blitzer.zip
unzip blitzer.zip
rm blitzer.zip
```

## Help and Contribution

If you find a problem, feel free to open an issue and I will do my best to help. If you have something to contribute, your help is greatly appreciated! If you want to add a new feature, please open a pull request first so we can discuss the details.

## Disclaimer

This custom integration is not officially endorsed or supported by Blitzer.de. Use it at your own risk and ensure that you comply with all relevant terms of service and privacy policies.

There is no official, documented Blitzer.de API. This integration queries `cdn2.atudo.net`, the backend used internally by the Blitzer.de map application, the same way a number of other long-standing community projects (for Home Assistant, ioBroker, FHEM, and others) do. It is not a sanctioned integration point.

Blitzer.de's terms of use grant only a non-exclusive, non-transferrable license for private use of their apps, and explicitly prohibit reverse-engineering their apps and using their traffic data "in any way without our written consent or license." Using this integration is likely a violation of those terms in the strict sense, even though there's no indication of Blitzer.de having taken action against the existing ecosystem of similar tools. Use it at your own legal risk.
