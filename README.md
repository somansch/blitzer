# <img src="https://raw.githubusercontent.com/somansch/blitzer/main/custom_components/blitzer/brand/icon.png" width="40" height="40" align="top"> Blitzer.de Integration for Home Assistant - speed controls and traffic hazards on your map

[![GitHub release](https://img.shields.io/github/v/release/somansch/blitzer)](https://github.com/somansch/blitzer/releases/latest)
[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/default)
[![License](https://img.shields.io/github/license/somansch/blitzer)](https://github.com/somansch/blitzer/blob/main/LICENSE)
[![Downloads](https://img.shields.io/github/downloads/somansch/blitzer/total)](https://github.com/somansch/blitzer/releases)
[![Downloads@latest](https://img.shields.io/github/downloads/somansch/blitzer/latest/total)](https://github.com/somansch/blitzer/releases/latest)

> **Note:** This is a continuation of the original [`hass-blitzerde`](https://github.com/timniklas/hass-blitzerde) integration by [@timniklas](https://github.com/timniklas). That GitHub account and repository are no longer available. This repository keeps the project going, so existing users are not left without updates.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-card-default.png" alt="The Blitzer card in its three formats: portrait with the map above the list, landscape with them side by side, and the minimal line counting everything reported, what of it is new, and what the jams among it cost" width="100%">

> **A note on language:** this README is written in English. The integration speaks both, so every button and field below is named **English / Deutsch**. Sample data stays as Blitzer.de sends it, which is German.

## Overview

Knowing what is on the road ahead usually means opening a phone app. This integration brings Blitzer.de's reports into Home Assistant in addition. They can sit on your dashboard, feed the notifications you already use, and answer "what is out there right now" without you looking it up.

You configure an area or a route. An area is a centre point plus a radius. A route is a corridor along waypoints you draw yourself. What Blitzer.de reports there arrives as `geo_location` entities. Those work natively on Home Assistant's [map card](https://www.home-assistant.io/dashboards/map/), each carrying its distance, its address and what it actually is.

Typical reasons to use it:

- **Be told the moment something new turns up.** A push notification, a spoken announcement, or whatever you already use. The bundled [blueprint](#blueprint-report-alerts) sets that up without any YAML.
- **Ask what is out there before you set off.** One message listing everything currently reported - at a set time, when you leave home, or on demand.
- **Put it on a dashboard.** The [Blitzer card](#blitzer-card) comes with the integration: the area's reports as a list, nearest first, with a map above them. Nothing to download and no resource to register.
- **See it on a map**, with Blitzer.de's own symbols instead of generic markers. Controls and hazards sit on separate sources, so either can be shown alone.
- **Get more than speed cameras.** Red light cameras, section controls, tunnel cameras, distance, weight, height and lane checks, entrance and access controls, overtaking bans, police checks and dummies. Seventeen kinds, each tickable on its own.
- **Get traffic hazards too.** Tailbacks with the length of the queue and the delay it costs, plus accidents, roadworks, obstacles, broken-down vehicles, road blocks and official bulletins.
- **Watch a commute rather than a circle.** Draw a corridor along waypoints. No external routing engine needed.
- **Poll each half at its own pace.** A tailback is stale within a minute. A permanent roadwork is still there next week. Each interval costs its own request.
- **Print a report in one line.** Every entity carries a ready-made `summary`, so a card or a notification uses one field instead of six.

Two different things are reported. Each is switched on separately, and each gets its own map source:

- **Controls / Kontrollen.** Two axes decide what you get: how a control is *installed* (mobile, trailer, fixed, archive) and what it *measures* (seventeen kinds). Both have to say yes.
- **Hazards / Gefahren.** Ten types, each tickable on its own. All off by default, so an existing entry keeps reporting exactly what it did before.

**Questions, feedback, or just want to see what others are doing with it?** Join the discussion on the [Home Assistant Community thread](https://community.home-assistant.io/t/blitzer-de-integration-speed-camera-for-germany/1016805).

## Quick start

1. **Install** via [HACS](#hacs-recommended) or [manually](#manual), then restart Home Assistant.
2. Go to **Settings → Devices & Services → Add Integration** / **Einstellungen → Geräte & Dienste → Integration hinzufügen** and search for "Blitzer.de". Name your first entry and pick a search mode ([Adding an area, tracker or route](#adding-an-area-tracker-or-route)).
3. Choose what to report: the four installation forms, the seventeen [control types](#control-types--kontrollarten), and the ten [hazard types](#hazard-types--gefahren). Hazards stay off until you switch them on.
4. Put it on a dashboard. **Add card → Blitzer.de** gives you the [card that comes with the integration](#blitzer-card). Or drop the area's `blitzer_<area>_controls` and `blitzer_<area>_hazards` sources into the [map card](#map-card), or use the ready-made [Markdown card](#markdown-card).
5. Want to be told rather than to look it up? Create an automation from the [Report Alerts blueprint](#blueprint-report-alerts), which is installed along with the integration. No YAML required.

Add the integration itself only once. Every further entry is added from the "Blitzer.de" tile's own **Add entry** / **Eintrag hinzufügen** - one per area, each with its own entities.

That is the whole setup. Everything below covers the individual options in more depth.

## Quick links

**Setting up**

- [Adding an area, tracker or route](#adding-an-area-tracker-or-route)
  - [Area (radius) / Bereich (Radius)](#area-radius--bereich-radius) - every field in the form
  - [Control types / Kontrollarten](#control-types--kontrollarten) - the seventeen switches, and why there are two axes
  - [Archive data / Archivdaten](#archive-data--archivdaten) - what it is, and what it is not
  - [Hazard types / Gefahren](#hazard-types--gefahren) - the ten switches, and the two worth knowing about
  - [Device tracker (radius) / Gerätetracker (Radius)](#device-tracker-radius--gerätetracker-radius) - a circle that follows a phone or a car
  - [Route (waypoints) / Route (Wegpunkte)](#route-waypoints--route-wegpunkte)
  - [Route (start/destination) / Route (Start/Ziel)](#route-startdestination--route-startziel) - a route worked out by openrouteservice

**How reports behave**

- [Created entities](#created-entities) - every sensor and every attribute, for your own templates

**Automations**

- [Automation examples](#automation-examples)
  - [Blueprint: Report Alerts](#blueprint-report-alerts)
  - [Use in your own automations](#use-in-your-own-automations)
    - [New reports anywhere in the area](#new-reports-anywhere-in-the-area)
    - [New controls entering a defined zone](#new-controls-entering-a-defined-zone)
    - [On-demand refresh for a commute](#on-demand-refresh-for-a-commute)

**Showing reports on a dashboard**

- [Blitzer card](#blitzer-card) - the card that comes with the integration
  - [Formats](#formats) - portrait, landscape, and one line with a pop-up
  - [YAML](#yaml) - the options that decide what the card is
  - [CSS variables](#css-variables) - all 159, and the scheme behind their names
- [Map card](#map-card)
- [Markdown card](#markdown-card)

**Installing**

- [Installation](#installation)
- [Help and Contribution](#help-and-contribution)
- [Disclaimer](#disclaimer)

## Adding an area, tracker or route

Go to **Settings → Devices & Services** / **Einstellungen → Geräte & Dienste**. Use **Add Integration** / **Integration hinzufügen** at the bottom right, search for "Blitzer.de" and add your first area.

The integration is added only once. To track further areas - say both "München" and "Berlin" - open the "Blitzer.de" card and use its own **Add entry** / **Eintrag hinzufügen**. One entry per area, each with its own entities.

After naming the entry, pick a search mode / **Suchart**:

- **Area (radius)** / **Bereich (Radius)** - the classic mode: one centre point plus a radius circle.
- **Device tracker (radius)** / **Gerätetracker (Radius)** - the same circle, around a tracker instead of a fixed point ([below](#device-tracker-radius--gerätetracker-radius)).
- **Route (waypoints)** / **Route (Wegpunkte)** - search a corridor along a route you draw ([below](#route-waypoints--route-wegpunkte)).
- **Route (start/destination)** / **Route (Start/Ziel)** - the same corridor, along a route openrouteservice works out from a start, a destination and optional via points ([below](#route-startdestination--route-startziel)).

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-wizard.png" alt="The first setup screen: the entry's name, and the choice between Area (radius), Device tracker (radius), Route (waypoints) and Route (start/destination)" width="55%">

Every field can be changed later. Open **Settings → Devices & Services**, find the entry and click **Configure** / **Konfigurieren**. The form opens pre-filled.

### Area (radius) / Bereich (Radius)

| Field | Description |
|---|---|
| **Display name** / **Anzeigename** | Freely chosen name for this area. It names the entry's device, and through it every entity id (`sensor.berlin_anzahl_kontrollen`). It is also the `area` attribute on every entity. Renaming later is safe: entities are identified by the entry, not by its name. |
| **Section** / **Bereich** | Drag the map to the centre point you want, then adjust the radius circle. Everything inside is reported, subject to the switches below. |
| **Controls** / **Kontrollen** – Mobile | Anything set up temporarily. A handheld or tripod measurement, most often speed. |
| **Controls** / **Kontrollen** – Trailer / **Anhänger** | Trailer-mounted, semi-stationary installations. These stand for days or weeks rather than hours. |
| **Controls** / **Kontrollen** – Fixed / **Feste** | Permanently installed ones. Not only speed cameras: section controls, tunnel cameras, weight, height, lane and entrance checks and dummies are all fixed. That is what the **Kontrollarten** switches are for. |
| **Controls** / **Kontrollen** – Archive data / **Archivdaten** | Blitzer.de's archived reports - see [Archive data](#archive-data--archivdaten). Off by default. These are **not** things that are there now. |
| **Control types** / **Kontrollarten** | A list of seventeen, one per kind - see [Control types](#control-types--kontrollarten). All ticked by default. A control is reported only if **both** its installation form above **and** its kind here are ticked. |
| **Hazards** / **Gefahren** | A list of ten, one per type - see [Hazard types](#hazard-types--gefahren). All unticked by default, so an existing entry keeps reporting what it did before. Each type you tick becomes its own `geo_location` entity. |
| **Only show confirmed** / **Nur bestätigte Kontrollen anzeigen** | Report only controls the Blitzer.de community has confirmed recently. Fixed installations carry no confirmation at all and are always kept - otherwise this switch would hide every one of them. |
| **Number of controls** / **Maximale Anzahl der Kontrollen** | Upper limit on how many controls are tracked at once. Default 9. Anything beyond that is ignored. |
| **Update interval (minutes, 0 = manual only)** / **Aktualisierungsintervall (Minuten, 0 = nur manuell)** | How often this area polls **for controls**. Default 1 minute. **0** switches automatic polling off; use the [`blitzer.refresh_controls` action](#on-demand-refresh-for-a-commute) instead. |
| **Counts as new for (minutes, 0 = off)** / **Als neu zählen für (Minuten, 0 = aus)** | How long a **control** counts as new after Blitzer.de first reported it. Default 60 minutes. Also settable from the area's device page, where it is the **Controls new for** / **Kontrollen neu für** field - the one setting that does not rebuild the entry when it is changed. `0` switches the marking off. |
| **Whitelist (comma-separated city names)** / **Whitelist (kommagetrennte Städtenamen)** | City names to keep, case-insensitive exact match, e.g. `Berlin,Potsdam`. Empty means no filtering. |
| **Blacklist (comma-separated control IDs)** / **Blacklist (kommagetrennte Kontroll-IDs)** | Control IDs to always exclude, regardless of the whitelist, e.g. `120644,167589`. The ID is the `id`/`backend` attribute - the same number used in `https://map.blitzer.de/v5/ID/<id>/`. Use it for specific reports; the whitelist filters by city instead. |
| **Number of hazards** / **Maximale Anzahl der Gefahren** | Upper limit for hazards, default 9, independent of the control limit. A dashboard showing 9 controls has no reason to cap roadworks at 9 too. Raise it deliberately if you enable **Dauerbaustelle**. |
| **Update interval** / **Aktualisierungsintervall** (hazards) | How often this area polls **for hazards**, independent of the control interval. **0** leaves [`blitzer.refresh_hazards`](#on-demand-refresh-for-a-commute) as the only way to update them. |
| **Counts as new for** / **Als neu zählen für** (hazards) | The control window's counterpart, and a separate setting because the two halves age at different speeds: a tailback is stale within the hour, a permanent roadwork is news for a day. Default 60 minutes. On the device page it is **Hazards new for** / **Gefahren neu für**. |
| **Whitelist** / **Whitelist** (hazards) | The control whitelist's counterpart. Note that a police report sometimes carries no city at all; those are dropped when a whitelist is set. |
| **Blacklist (comma-separated hazard IDs)** / **Blacklist (kommagetrennte Gefahren-IDs)** | The control blacklist's counterpart. Hazard IDs are their own numbering - an ID blacklisted as a control means nothing here. |

The last nine fields sit in two collapsible sections: **Optional settings for controls** / **Optionale Einstellungen Kontrollen** and **Optional settings for hazards** / **Optionale Einstellungen Gefahren**.

### Control types / Kontrollarten

Two axes decide which controls you get, and both have to say yes:

- **Controls** / **Kontrollen** - how the thing is *installed*: mobile, trailer, fixed, archive.
- **Control types** / **Kontrollarten** - what it *measures*.

The second axis exists because the first one hides almost everything. A tunnel camera, both halves of a section control, a weight check, a height check, a dummy and a plain speed camera are all `fixed`. In the test data that was 98 of 127 controls, all governed by a single switch.

| Option (`kind`) | English | Deutsch |
|---|---|---|
| `speed` | Speed | Geschwindigkeit |
| `redlight` | Red light | Rotlicht |
| `redlight_speed` | Red light & speed | Rotlicht & Geschwindigkeit |
| `section_control` | Section control | Abschnittskontrolle |
| `tunnel` | Speed camera in tunnel | Blitzer im Tunnel |
| `distance` | Distance | Abstand |
| `weight` | Weight | Gewicht |
| `height` | Height | Höhe |
| `lane` | Lane | Spur |
| `entry` | Entrance | Einfahrt |
| `access` | Access | Auffahrt |
| `crosswalk` | Pedestrian crosswalk | Fußgängerüberweg |
| `overtaking` | Overtaking ban | Überholverbot |
| `police` | Police check | Polizeikontrolle |
| `alcohol` | Alcohol check | Alkoholkontrolle |
| `dummy` | Dummy | Attrappe |
| `unknown` | Unknown | Unbekannt |

Blitzer.de distinguishes several variants of the same control: a speed camera on a tripod, in a housing, or in the archive. They are grouped under one switch here, because you want to filter on the control, not the variant.

Anything Blitzer.de starts reporting after this release belongs to no switch yet. It is reported rather than dropped, so a new kind shows up instead of vanishing.

Unticking a kind also stops it being *requested*. Leaving the ones you don't care about unticked therefore costs nothing.

All three groups are single multi-select lists rather than one switch per option. Seventeen separate switches came to about 1300 px of form; as a list the same seventeen take 700 px, and the four installation forms 180 px instead of 300 px.

### Archive data / Archivdaten

Blitzer.de keeps a second set of records alongside its live data: archived speed cameras and distance checks. Its own map calls them **"Archiv-Daten"**, handles them apart from the live ones, and draws them as smaller secondary markers.

They are **not controls that are there now.** What the live data shows:

- They carry no community data. Their `info` is empty, so there is no confirmation count, no quality and no comments. **Nur bestätigte Kontrollen anzeigen** cannot filter them.
- Their IDs never overlap the controls reported as current - measured across four regions.
- Roughly a quarter sit within 50 m of one that *is* current: the archived predecessor of an installation still standing. The rest are elsewhere entirely.
- They are numerous. The archived speed cameras alone fill an entire response around Berlin.

Switch them on and they arrive as their own `type`, `archive`, with Blitzer.de's own archive symbol. They can never be mistaken for a live one, on a map or in a template.

They are fetched in a request of their own and appended *after* the live controls. **Maximale Anzahl der Kontrollen** is therefore spent on current ones first. To see archived ones at all, raise that limit.

Useful for spotting where enforcement used to be. Not useful as a warning.

### Hazard types / Gefahren

Everything Blitzer.de reports that is not a control, one switch each. The names are Blitzer.de's own rather than invented here: several of these carry a speed value and would otherwise read like speed limits.

The key is what a hazard entity reports as `type`, and what a `blitzer_new_hazard` event carries.

| English | Deutsch | `type` |
|---|---|---|
| End of tailback | Stauende | `tailback_end` |
| Accident | Unfall | `accident` |
| Temporary roadwork | Tagesbaustelle | `roadwork_temporary` |
| Obstacle | Hindernis | `obstacle` |
| Slipperiness | Rutschgefahr | `slippery` |
| Obstructed view | Sichtbehinderung | `obstructed_view` |
| Permanent roadworks | Dauerbaustelle | `roadwork_permanent` |
| Broken down vehicle | Defektes Fahrzeug | `broken_down_vehicle` |
| Road block | Sperrung | `closure` |
| Police reports | Polizeimeldung | `police_report` |

Hazards are fetched in a **request of their own**, never alongside the controls. Blitzer.de answers with at most around 500 markers, in no particular order. Sharing one request would let a busy area's roadworks push controls out of the result.

Measured across the Ruhr area: the same box returned 162 controls when asked for them alone, and 101 of those same 162 once permanent roadworks shared the request.

Two types are worth knowing about before you switch them on:

- **Permanent roadworks** / **Dauerbaustelle** is by far the most numerous. A 20 km radius around Berlin returns the full ~500 on its own. Enable it with **Maximale Anzahl der Gefahren** raised and a long update interval. Or leave it off and use the short-lived types instead.
- **Slipperiness** / **Rutschgefahr**, **Obstructed view** / **Sichtbehinderung** and **Road block** / **Sperrung** are declared by Blitzer.de, but returned nothing in any region sampled while writing this. They are offered for completeness; do not be surprised by an empty result.

### Device tracker (radius) / Gerätetracker (Radius)

Area mode asks what is reported around a point. This one asks what is reported around *you*: before every poll it reads the position off a tracker and searches the same circle there.

Two fields, and below them the area form unchanged:

| Field | Description |
|---|---|
| **Device tracker** / **Gerätetracker** | The tracker to follow. The list is a short one: only `device_tracker` entities **reporting coordinates at that moment** are offered - the Home Assistant companion app, a GPS logger, a car integration. One that knows nothing but home and away has no position to put a circle around, so offering it would only buy an entry that fails at its first fetch, long after the form was filled in. If nothing on your instance qualifies, the form says so instead of showing an empty dropdown. `person` entities are deliberately not offered: a person is a layer over whichever tracker is reporting for them, and this entry wants the tracker itself. |
| **Radius (meters)** / **Radius (Meter)** | How far around it to search. 50 to 20 000 m, default 1 000. |

Everything under those two is the area form field for field - the four installation forms, the seventeen [control types](#control-types--kontrollarten), the ten [hazard types](#hazard-types--gefahren), both optional sections and both update intervals. They mean exactly what they mean [there](#area-radius--bereich-radius).

What is different is only where the circle sits:

- **The position is read once per poll**, not once per request, so the controls, the archive and the hazards of one poll are always searched around the same point.
- **Distance is measured from the tracker**, not from the home zone. Each marker's state is how far it was from the tracker when that search was made - which is the point those reports were actually found around.
- **The entry's device model is `Tracker`**, so the card's subtitle line says so, the way it says `Radius` or `Route` for the other two.
- **Both refresh actions work unchanged.** `blitzer.refresh_controls` and `blitzer.refresh_hazards` re-read the position along with everything else.

**Pick the radius against the update interval, not against what looks like a sensible distance.** The circle is only ever as current as the last poll, and a car covers ground between two of them: at 100 km/h it crosses a 1 km radius in 36 seconds, at 130 km/h in 28. On a motorway with the default one-minute interval, a radius under about 3 km is a circle the car has already left. In town, where 50 km/h needs 72 seconds for that same kilometre, 1-2 km is plenty.

**If the tracker has no position**, the entry says so rather than reporting an empty area. Found at startup, it waits in **Retrying setup** with the reason on the integration page - "reports no usable position (home)" - and starts by itself once the tracker reports one. Home Assistant retries a waiting entry on a backoff that doubles from 10 seconds to at most 10 minutes, so a tracker that reports a few seconds late costs seconds; one that was missing all morning can cost up to those ten minutes. **Reload** / **Neu laden** on the entry's own menu skips the wait. Lost while running - a phone in a tunnel, a tracker briefly unavailable - the entry stays up and its entities go `unavailable` until the next poll that finds a position. Neither case reports zero controls, because "we do not know where to look" is not the same answer as "nothing is reported there".

Editing a tracker entry via **Configure** / **Konfigurieren** opens that same form, filled in with what is saved. The tracker you already picked stays on the list even while it is briefly without a fix, so opening the form to change something else cannot quietly drop it.

> **Tip:** the interval polls on a clock, not on movement. To also refresh the moment the tracker moves, trigger an automation on its `latitude` attribute and call `blitzer.refresh_controls` for the entry - the same action the [commute example](#on-demand-refresh-for-a-commute) uses. Setting the entry's own interval to `0` then makes that automation the only thing that polls it.

### Route (waypoints) / Route (Wegpunkte)

For a commute, an area search would need an impractically large radius. Route mode lets you draw the route as a chain of waypoints instead, one map at a time. It is the same drag-the-map interaction as the radius picker, just repeated per point:

1. Move the map to the starting point. Leave **Add another waypoint** / **Weiteren Wegpunkt hinzufügen** checked and continue - one map screen per waypoint.
2. Add a waypoint wherever the route bends noticeably. The corridor runs along the *straight* line between consecutive waypoints, not along actual roads. A long straight line across a curve misses whatever sits on the curve, and searches too widely off to the side.
3. Uncheck **Add another waypoint** once the last one is placed. At least two are needed.
4. Set the **Corridor width (meters)** / **Korridorbreite (Meter)** - how far to each side of the line to search, default 300 m.

Below that are the same **Kontrollen**, **Kontrollarten**, **Gefahren** and optional-settings sections as in area mode, both update intervals included. Hazards along a route are found exactly the way controls are: the corridor is sampled point by point and the results merged.

Internally the integration places sample points along the line, one every corridor width of route. It queries Blitzer.de around every one of them, then merges the results and removes duplicates by id - so a route drawn with many waypoints close together costs no more requests than one drawn with few.

Editing a route via **Configure** / **Konfigurieren** first asks what to edit:

- **Edit waypoints** / **Wegpunkte bearbeiten** steps through every saved waypoint, one at a time. Move the map to reposition it, or check **Remove this waypoint** / **Diesen Wegpunkt entfernen** to drop it. Afterwards you can append further waypoints to the end. The route is not discarded and redrawn.
- **Edit search settings** / **Sucheinstellungen bearbeiten** jumps straight to corridor width, the switches and the optional settings, leaving the waypoints untouched.

### Route (start/destination) / Route (Start/Ziel)

The waypoint route searches along straight lines, which is why it needs a waypoint on every bend. This mode leaves the road to openrouteservice: you give it a start, a destination and, wherever your usual way differs from the fastest one, a few via points. The route it works out is stored with the entry and searched like a waypoint route, in a corridor as wide as its length calls for.

It needs a free **openrouteservice API key** - an account at [openrouteservice.org](https://openrouteservice.org) comes with one. The key is only used while the route is set up or changed. Working out a route is a single request; every poll after that goes to Blitzer.de alone.

The setup walks these screens:

1. **API key** / **API-Key.** Tried out straight away with one lookup, so a wrong key is caught here rather than at the end. **Save the key for further routes** / **API-Key für weitere Routen speichern**, on by default, keeps it with the integration, and every further route then skips this screen. The field is never filled in - a filled-in field sends its value to the browser along with the form - so to keep a key that is already there, leave it empty. Removing the last Blitzer.de entry removes the saved key with it.
2. **Start** and **Destination** / **Ziel**, each picked from a menu:
   - **Zone** - any zone, `zone.home` or your workplace, say.
   - **Point on the map** / **Punkt auf der Karte** - move the map to the spot.
   - **Address** / **Adresse** - street and town, looked up near your home. The next screen, **Address found** / **Adresse gefunden**, shows the match in an editable field: continue unchanged to take it, or correct it and continue to have it looked up again and shown again.
3. **Via points** / **Via-Punkte.** openrouteservice takes the fastest road between the points it is given. If yours is a different one, add a via point on it. Up to 20; **Remove all via points** / **Alle Via-Punkte entfernen** starts over. Each via point only snaps to a road heading the way the route runs there, so one dropped on a motorway picks the carriageway in your direction - not the opposite one, which would send the route on to the next junction and back.
4. **Which way?** / **Welcher Weg?** - only without via points, and only when openrouteservice has more than one way to offer. Up to three routes, fastest first, each named with its length and driving time, and all of them on the map: the first as the route, the others dashed, numbered the way the entries are. Pick one to continue. With via points the way is already pinned down and this screen is skipped.
5. **Your route** / **Deine Route.** The route on a map - start, destination and via points marked - with its length and driving time, and below it **Distance from the route** / **Abstand zur Route**, then **Also create the way back** / **Auch den Rückweg anlegen**, then the switches and optional sections of the waypoint route.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-wizard-routes.png" alt="The Which way? screen: three routes from openrouteservice, fastest first with their length and driving time, all of them drawn on the map with the first as the route and the others dashed" width="55%">

**Also create the way back** makes a second entry, destination to start, with its own route worked out by openrouteservice - on a motorway the way back is the other carriageway, and a tailback on one is not one on the other. It is named after the first entry with "return" / "Rückweg" added, and takes the same settings. Both entries are independent from then on: each has its own **Configure**, and removing one leaves the other. The switch is offered when a route is created, not when one is edited.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-card-route-return.png" alt="The card of a return entry: the route drawn on the map with the reports on it, and a list measuring each one along the route from its start" width="45%">

There is no corridor width to set. The route is searched in boxes along it - about 40 of them, never narrower than 300 m and never wider than 5 km, so a long route does not cost hundreds of Blitzer.de requests a minute. Their width is the `corridor_width` attribute of the entry's **Total count** sensor.

Those boxes only find candidates. What is reported is decided by **Distance from the route** / **Abstand zur Route**: 60 m by default, adjustable from 10 to 300 m, measured from the route line itself. On a first real route, Munich to Poing, that kept 9 of 18 reports - the other 9 were on streets 290 to 800 m away, and nothing lay between 80 and 290 m.

Some reports have a length and are measured along it: roadworks that come with a line of their own, and tailbacks with an end point, so a queue whose far end reaches onto the route counts. A tailback must also run the way the route does - on a motorway the opposite carriageway lies well within 60 m, and a queue there is one this route never meets. Blitzer.de does not say which way a queue runs; routing along three real motorway queues in both directions showed it runs from the reported point towards its end point. Speed cameras cannot be told apart by direction: Blitzer.de gives them none beyond free text, so a camera in the other tube of a tunnel stays in.

The map on that last screen is Home Assistant's own, the one its dashboards use. A setup form has no field that can draw a line, so the integration's frontend file puts the map there itself. That relies on how Home Assistant builds its dialogs rather than on a documented interface. Should that change one day, the screen still works - it names the route, its length and its driving time, without the map.

If openrouteservice cannot produce a route - a point too far from any road, no road between the points, a route beyond its limits, or a key it no longer accepts - a screen says which, and continuing goes back to where it can be fixed.

Editing a route entry via **Configure** / **Konfigurieren** first asks what to edit:

- **Change the route (start, destination, via points)** / **Route ändern (Start, Ziel, Via-Punkte)** walks the screens again, each filled in with what is saved. The route is only worked out again once an end or a via point has actually changed.
- **Edit search settings** / **Sucheinstellungen bearbeiten** goes straight to the last screen, with the saved route - no request to openrouteservice at all.
- **Change the openrouteservice API key** / **openrouteservice-API-Key ändern**. A saved key changed here changes for every route that uses it.

On the [Blitzer card](#blitzer-card), the map of a route entry - this mode or the waypoint one - shows the route itself, fitted into view when the card first draws it, with the reports on top of it. **Show the route on the map** / **Route in der Karte einzeichnen** under the card's map switch turns that off; **Layout → Map** sets the line's colour and width.

## Created entities

Each entry produces the entities below. The three sensors are named in your Home Assistant's language:

| Entity | Example ID | Description |
|---|---|---|
| Count sensor: **Control count** / **Anzahl Kontrollen** | `sensor.<area>_anzahl_kontrollen` | How many controls are currently reported, capped at **Maximale Anzahl der Kontrollen**. Its attributes break the count down per city and carry `last_update`. |
| Count sensor: **Hazard count** / **Anzahl Gefahren** | `sensor.<area>_anzahl_gefahren` | The same for hazards, capped at **Maximale Anzahl der Gefahren**, with its own `last_update`. |
| Count sensor: **Total count** / **Anzahl Gesamt** | `sensor.<area>_anzahl_gesamt` | Both counts added together. The one place both timestamps sit side by side: `last_update_controls`, `last_update_hazards`, and `last_update` for the later of the two. |
| One `geo_location` entity per control | `geo_location.<area>_kontrolle_<street>` | Created and removed as controls appear and disappear. There is no fixed pool of entities. |
| One `geo_location` entity per hazard | `geo_location.<area>_gefahr_<street>` | The same, on the area's `blitzer_<area>_hazards` source. |
| Number: **Controls new for** / **Kontrollen neu für** | `number.<area>_kontrollen_neu_fur` | How many minutes a control counts as new. The same setting as in the options form, put where the sensors it governs are listed. A configuration entity, so it sits under the device's **Configuration** heading rather than among the readings. |
| Number: **Hazards new for** / **Gefahren neu für** | `number.<area>_gefahren_neu_fur` | The same for hazards. Changing either of these is the one change that does **not** rebuild the entry: no refetch, no entity churn, nothing but a number two sensors report. |

Every entry gets a **device** of its own, named after the area. Home Assistant renders the full name from the device name plus a short entity name: "Berlin Anzahl Kontrollen" on a German instance, "Berlin Control count" on an English one. The old "Blitzer.de" prefix is gone, since the integration is already called that.

The **entity id** does not follow the language. It is generated once, when the entity is first registered, from the name in force at that moment - and never changes afterwards. An instance set up in German keeps `sensor.berlin_anzahl_kontrollen` even after switching to English. Only entries added *after* the switch get English ids.

The device's **model** field says how the entry searches: `Radius`, `Tracker`, `Wegpunkte` or `Route`. All of an area's entities, markers included, group under that one device card.

Every `last_update` is the moment that half last *fetched*, not the moment its data last changed. It only advances on a fetch that actually succeeded.

An entry whose polls fail **three times in a row** raises a repair under **Settings → System → Repairs** / **Einstellungen → System → Reparaturen**, naming the entry and the last reason - a tracker that reports no position, a tracker entity that no longer exists, a Blitzer.de that cannot be reached. One missed poll does not: a phone in a tunnel is back before the third. The repair goes away with the next poll that succeeds, and with the entry when it is removed or reloaded.

Each count sensor also carries what its half counts as **new**:

| Attribute | On | Description |
|---|---|---|
| `new_minutes` | Control count, Hazard count | That half's window, in minutes. `0` when the marking is switched off. |
| `new` | Control count, Hazard count | How many of the reported ones fall inside it. Absent while the window is `0`. |
| `new_minutes_controls`, `new_minutes_hazards` | Total count | Both windows, always. The one place they can be read side by side. |
| `corridor_width` | Total count | Route (start/destination) entries only: the width of the boxes the route is searched in, in metres, worked out from its length. Which reports within them are kept is decided by **Distance from the route**. |
| `new` | Total count | Both halves added together, whenever at least one window is on. |

The window is deliberately a property of the *area* rather than of a card or an automation. A notification, a template and the [Blitzer card](#blitzer-card) reading the same number is what keeps them from disagreeing about what "new" means.

Attributes on each control's `geo_location` entity:

| Attribute | Description |
|---|---|
| `state` | Distance in km (or miles). From the area's centre point, from the tracker, or - on a route - the way along the route from its start to where the report lies, so the markers read like the trip: this one at km 3, that one at km 23. |
| `source` | `blitzer_<area>_controls`, e.g. `blitzer_berlin_controls`. Lets a map card select one area's controls. |
| `area` | The display name you gave this area. |
| `type` | How the control is installed: `mobile`, `trailer`, `fixed` or `archive`. Decided by the `fixed` and `partly_fixed` flags inside `info`, by their *value* - the API also sends `partly_fixed: "0"` for one explicitly *not* semi-stationary. **This no longer reports `redlight`**; see `kind`. |
| `kind` | What the control measures: `speed`, `redlight`, `section_control`, `tunnel`, `distance` and so on - see [Control types](#control-types--kontrollarten). Empty for anything this release has no grouping for. |
| `type_name` | What it is, in Blitzer.de's own words: "Blitzer im Tunnel" / "Speedcam inside tunnel". Finer than `type` and `kind`, which between them can only say "fixed" and "speed". Follows the **server** language under **Settings → System → General**, not a user's own frontend language, because entity attributes are stored once for everyone. Empty for something this release has no wording for. |
| `summary` | The whole control in one readable line, so a card prints one field instead of six: `Geschwindigkeitsblitzer · 100 km/h · A10 Tauernautobahn, Trebesing — 500m vor Tunneleinfahrt in Rtg. Spittal, Front- und Heckblitzer`. Type, speed limit, location, then the note from `info.desc` where there is one. Where the type name would leave out the more useful half, the line names the installation instead: `Mobiler Geschwindigkeitsblitzer` for a mobile one, `Anhängerblitzer` for one on a trailer. Blitzer.de reports both under the same type name as a fixed one, and `type_name` keeps that name unchanged. An **archived** report says `Archiv · …` first, so it can never be read as something standing there today. Same language rule as `type_name`. |
| `id` / `backend` | The control's numeric Blitzer.de ID. The same number appears in its `https://map.blitzer.de/v5/ID/<id>/` URL and in the blacklist. |
| `vmax` | Speed limit in km/h. `/` for red light cameras, `?` if unknown. |
| `counter` | Number of community confirmations. Always `0` for fixed installations - 128 of 128 in the test data. |
| `city`, `street`, `zip_code` | Address. |
| `created`, `confirmed` | Blitzer.de's own stamps, exactly as sent, and **not** full timestamps. Each is either a date (`20.08.2026`) or a time of day (`13:21`, meaning today), never both. A fixed camera usually reports `01.01.1970` as `confirmed`: the epoch stands in for "never confirmed", since fixed installations are not community-reported. |
| `info` | The raw detail object, small enough to carry whole. `desc` holds a fixed camera's written-out note ("Einbahnstr. in Rtg. Velbert, 7-17 Uhr 30 km/h, sonst 50 km/h"). `label`, `quality`, `tags` and `confirmed` hold the community's verdict on a mobile one. `{}` whenever the API sends something other than an object. |
| `entity_picture` | The symbol blitzer.de's own map draws for this one, chosen the way it chooses. A tunnel camera, a section control and a combined red light plus speed camera each get their own. |

Attributes on each hazard's `geo_location` entity:

| Attribute | Description |
|---|---|
| `state` | Distance in km (or miles), measured exactly like a control's. |
| `source` | `blitzer_<area>_hazards`, e.g. `blitzer_berlin_hazards`. |
| `area` | The display name you gave this area. |
| `type` | The key from the [hazard types table](#hazard-types--gefahren), e.g. `roadwork_permanent`. |
| `type_name` | The same key in Blitzer.de's own words: "Dauerbaustelle" / "Permanent roadworks". Same language rule as on a control. |
| `summary` | The hazard in one readable line: `Stauende · 2.3 km · 34 km/h · +3 min · A100, Berlin`. Where Blitzer.de supplies its own text it reads `Polizeimeldung · B2R, München — Mittlerer Ring bis Petueltunnel …`. Only figures that were actually sent appear, so a tailback carrying none reads `Stauende · A100, Berlin`, and a roadwork never shows a crawl speed. The location matters most on the types that say nothing else: an accident and a broken-down vehicle arrive with `info` set to a bare `false`, and a day roadwork with every field of its `info` empty. Where Blitzer.de fills an address field with a placeholder (`Straßenname unbekannt`, or a bare `unbekannt` for a town), that half is dropped from this line. The `street` and `city` attributes still report it verbatim. |
| `id` / `backend` | The hazard's Blitzer.de ID, used in its map URL and in the hazard blacklist. Unrelated to control IDs. |
| `reason` | Free text describing the hazard. A police report carries a fully written-out bulletin. Community-reported types usually carry nothing. |
| `counter` | Number of community confirmations. |
| `city`, `street`, `zip_code` | Address. A police report often has no postcode, sometimes no city, and carries its road only as `street`. |
| `created`, `confirmed` | Blitzer.de's own creation and last-confirmation stamps, as sent. A time of day for something reported today, a date for anything older, never both. |
| `length`, `duration`, `delay` | Only on the types that describe a stretch of road rather than a point, and not on all of those - plenty of tailbacks arrive with all three empty. `length` is in kilometers, `duration` the seconds it takes to drive through, `delay` the seconds lost against a clear road. |
| `tailback_speed` | How fast traffic is actually moving, in km/h: `length × 3600 ÷ duration`. That is the same arithmetic blitzer.de's own popup does; a 1 km queue taking 240 s is 15 km/h. Absent when either figure is missing. Deliberately absent on both kinds of roadwork, whose `length` describes the works rather than a queue - the map suppresses it there too. |
| `delay_minutes` | `delay` rounded up to whole minutes, the way blitzer.de shows it. 210 s becomes 4 min. Same exclusions as above. |
| `end_latitude`, `end_longitude` | The far end of that stretch, where one is given. |
| `info` | The raw detail object, alongside the individual fields lifted out of it above. `{}` for the types that do not send one. |
| `entity_picture` | Blitzer.de's own symbol for this hazard type. |

## Automation examples

### Blueprint: Report Alerts

A ready-to-use automation [blueprint](custom_components/blitzer/blueprints/automation/blitzer/report_alerts.yaml) covers both of the things people actually want, without writing any YAML.

**It comes with the integration.** After a restart it is waiting under **Settings → Automations & Scenes → Blueprints** / **Einstellungen → Automatisierungen & Szenen → Blueprints**, and **Create automation** / **Automatisierung erstellen** is the whole of what is left to do. A release that changes the blueprint brings the new version with it.

Want it on its own, in an instance without the integration? Import it straight from here:

[![Open your Home Assistant instance and show the blueprint import dialog with a specific blueprint pre-filled.](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fraw.githubusercontent.com%2Fsomansch%2Fblitzer%2Fmain%2Fcustom_components%2Fblitzer%2Fblueprints%2Fautomation%2Fblitzer%2Freport_alerts.yaml)

- **Live alerts** / **Live-Meldungen** - only what is new. One notification per newly reported control or hazard, the moment it shows up. Never for one already known, and never right after a restart. A time window keeps it quiet at night; a window from `22:00` to `06:00` spans midnight.
- **Digest** / **Sammelmeldung** - everything currently reported. One message listing what is standing right now, nearest first, capped at a length you choose. Trigger it at a time of day, when someone leaves a zone, from any entity changing state, or on demand via `automation.trigger`. Several of these can be armed at once.
- **One set of filters for both.** Which areas and routes, controls and/or hazards, what a control measures, how it is installed, which hazard types. A minimum speed limit keeps a 30 km/h camera in a side street quiet while the one on the motorway still reports.
- **Proximity** / **Umkreis.** Measure against a zone or a person, report only what is within a radius of it, and sort the digest by that distance. Left empty, every report carries its own figure - from the area's centre, from the tracker, or on a route the way along it from its start, so a route's digest reads in driving order.
- **Notify anywhere**, each its own collapsible section:
  - **Mobile App Notify**: push to one or more devices via the Companion App. A live alert is tappable straight through to that report on blitzer.de's map.
  - **Notifications**: Home Assistant's own notification bell, and/or a dashboard status helper (`input_text`) for a Markdown or Entity card.
  - **Text-to-Speech Announcement**: speak it on one or more media players, one after another rather than overlapping.
  - **Custom Actions**: anything else with the normal action editor - email, WhatsApp, Telegram, Signal, ntfy.
- **Customizable text.** Separate title and message templates for a live alert and for the digest. `{{ summary }}` gives the finished one-line description. The digest loops over `reports` itself, so the layout is yours.

The blueprint's own field descriptions, visible when you create an automation from it, cover every option in detail.

### Use in your own automations

Every report is both a plain event and a plain `geo_location` entity. Anything the blueprint does, your own automations can do too.

#### New reports anywhere in the area

Every area fires a **`blitzer_new_control`** event the moment a genuinely new control is detected. That happens on a poll, or on an on-demand `blitzer.refresh_controls`.

It never fires for one already known from an earlier poll, and never right after Home Assistant starts. That first fetch is "here is what is already there", not a new detection.

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "New control reported"
    triggers:
      - trigger: event
        event_type: blitzer_new_control
        event_data:
          area: Berlin
    actions:
      - action: notify.mobile_app_your_phone
        data:
          message: "{{ trigger.event.data.summary }}"
```

</details>

The event data holds `config_entry_id`, `area`, `id`, `type`, `kind`, `type_name`, `summary`, `vmax`, `street`, `city`, `zip_code`, `latitude`, `longitude` and `distance`.

`distance` is the marker's own figure, in km (or miles): from the area's centre, from the tracker, or on a route the way along it from its start - so an automation can say "at km 23" without a reference point of its own.

`summary` is the same one-line description the entity carries. A notification can print that one field instead of assembling six - straight from the event, without looking the entity up.

Drop the `event_data: area: ...` filter to match every configured area. This is a plain event, not tied to an entity, so the data is read from `trigger.event.data.*`.

Hazards fire their own **`blitzer_new_hazard`** event on the same terms. Its data is `config_entry_id`, `area`, `id`, `type` (the key from [Hazard types](#hazard-types--gefahren)), `type_name`, `summary`, `reason`, `street`, `city`, `zip_code`, `latitude`, `longitude` and `distance`. Here too, `summary` is the finished line, tailback figures included.

`reason` is the free text Blitzer.de attaches. On a police report that is a fully written-out bulletin ("A44, Düsseldorf Richtung Essen, ... linker Fahrstreifen gesperrt"). On a community-reported jam it is usually empty.

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Tailback or accident on the commute"
    triggers:
      - trigger: event
        event_type: blitzer_new_hazard
        event_data:
          area: Commute
    conditions:
      - condition: template
        value_template: "{{ trigger.event.data.type in ['tailback_end', 'accident'] }}"
    actions:
      - action: notify.mobile_app_your_phone
        data:
          message: "{{ trigger.event.data.summary }}"
```

</details>

Keep the `conditions` block. Without it, enabling **Dauerbaustelle** on a large area notifies you about every permanent roadwork it discovers.

#### New controls entering a defined zone

Want a proximity-based notification instead, once one is inside your home zone? Every control is also a `geo_location` entity ([see Created entities](#created-entities)), so Home Assistant's built-in [geolocation trigger](https://www.home-assistant.io/docs/automation/trigger/#zone-trigger) works too:

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "New control in zone"
    triggers:
      - trigger: geo_location
        source: blitzer_berlin_controls
        zone: zone.home
        event: enter
    actions:
      - action: notify.mobile_app_your_phone
        data:
          message: "{{ state_attr(trigger.entity_id, 'summary') }}"
```

</details>

A stationary control never moves after it is created. "Entering the zone" therefore happens once, right when it first appears. That is much like the event above, but scoped to the zone's radius rather than the whole area, and it needs a zone that overlaps the area you care about.

It also covers a mobile control's occasional position updates, which the event does not - that fires once, on first detection. Being tied to an entity, the data comes from `state_attr(trigger.entity_id, '...')`.

#### On-demand refresh for a commute

Each area has two update intervals, one per half. Setting either to **0** switches automatic polling of that half off entirely. It then only refreshes when you ask, via the **`blitzer.refresh_controls`** action - **Refresh controls** / **Kontrollen aktualisieren** in the UI.

Call it targeting the area you want. It fetches the latest controls, and creates, updates and removes that entry's `geo_location` entities exactly like a scheduled poll would. It optionally returns what it found, under a `controls` key.

A common use: a commute route set to manual-only, refreshed and sent to your phone the moment you leave home. No polling all day for a route you drive twice.

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Send commute controls when leaving home"
    triggers:
      - trigger: zone
        entity_id: person.your_name
        zone: zone.home
        event: leave
    actions:
      - action: blitzer.refresh_controls
        data:
          config_entry_id: YOUR_ROUTE_CONFIG_ENTRY_ID
        response_variable: commute
      - action: notify.mobile_app_your_phone
        data:
          message: >-
            {% if commute.controls %}
            🚨 {{ commute.controls | count }} control(s) on your commute:
            {% for c in commute.controls %}
            - {{ c.city }}, {{ c.street }}{% if c.vmax not in (None, '/', '?') %} ({{ c.vmax }} km/h){% endif %}
            {% endfor %}
            {% else %}
            Nothing currently reported on your commute. Safe drive!
            {% endif %}
```

</details>

Hazards have their own action, **`blitzer.refresh_hazards`** - **Refresh hazards** / **Gefahren aktualisieren**. It takes the same `config_entry_id` and returns `hazards`, each with `id`, `type`, `reason`, `city`, `street`, `latitude` and `longitude`.

The two are deliberately separate rather than one action with a switch. Refreshing your commute's controls should not spend a request on roadworks that have not moved since this morning, and each half leaves the other's data and timestamp untouched.

To find `YOUR_ROUTE_CONFIG_ENTRY_ID`: open **Settings → Devices & Services**, click the "Blitzer.de" integration, open the route's entry and copy the ID from the browser URL.

Or build the action once in **Developer Tools → Actions** / **Entwicklerwerkzeuge → Aktionen**. Pick the route from the **Area, route or tracker** / **Bereich, Route oder Tracker** dropdown, then switch to YAML mode there and copy the resolved `config_entry_id`.

## Blitzer card

The integration's own card. One list answering "what is on my way right now", per area or route: controls and hazards together, nearest first, with a map above them that can either mirror the list or drive it.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-card-actions.gif" alt="The card on a route entry being used: the NEW badge narrows it to what has just been reported, the red badge narrows it to the jams and what each of them costs, and a second click gives all the reports back - the map following the list each time" width="45%">

It comes with the integration. There is nothing to download, nothing to copy into `www` and nothing to register as a dashboard resource - restart Home Assistant after installing and the card is there, under **Blitzer.de** in the card picker.

Everything it draws is already in the frontend's own state. The reports are `geo_location` entities, the area names and their search mode come from the device registry, the "last updated" moment from the area's **Total count** sensor, and what still counts as new from that area's own [**Counts as new for** / **Als neu zählen für**](#area-radius--bereich-radius) windows. Nothing has to be configured a second time here.

### Adding it

- **Add card → Blitzer.de.** With no area picked, the card offers every configured one in a dropdown of its own.
- **The card picker's "By entity" tab.** Pick any report, count or window and the card is offered for it, already pinned to the area that entity belongs to and with the area dropdown switched off - whoever picked something of München was looking at München.

### Formats

`layout`, the first setting in the editor:

| Value | What it is |
|---|---|
| `portrait` | The map above, the list below. The default. |
| `landscape` | Map and list side by side. |
| `minimal` | One line carrying two or three numbers - everything the area reports, what of it is still new, and what the jams among it cost - each opening the pop-up on what it counted. Built for a dense dashboard, or for a section where a card of full height would be one too many. |

The picture at the top of this page shows all three side by side.

### What it can do

- **Pick the area on the card**, or pin it to one. Several areas on one card share a dropdown; a card pinned to a single area drops it.
- **Show controls, hazards or both**, switchable on the card itself.
- **A map that mirrors the list, or drives it.** Clicking an entry can centre the map on that report; the list can restrict itself to what the map currently shows, so panning the map is a way of asking a different question.
- **Draw a route on the map.** A route entry's route - the one openrouteservice worked out, or the straight lines between hand-placed waypoints - is drawn underneath the reports and fitted into view when the card first draws it. **Show the route on the map** / **Route in der Karte einzeichnen** turns it off; **Layout → Map** sets the line's colour and width, and the **Grouped reports** / **Zusammengefasste Meldungen** block beside it recolours the discs the map gathers nearby reports into. On a route entry every distance is the way along the route from its start, so the list reads in driving order.
- **Sort by distance, newest or oldest.** The order also decides which reports survive when the number shown is capped.
- **Measure distance from the area's centre, from the map, or from a person or zone**, so "nearest first" means nearest to whoever is driving.
- **Mark what is new.** The threshold is the area's own, set on its device page, so the card and every automation agree on what "new" means. A badge next to the title counts them; each entry carries a tag.
- **Say what the jams cost.** Where reports carry a delay - Blitzer.de sends one on a tailback, not on a roadwork - a red badge beside the NEW one adds them up: *+10 min*, *+1 h 35 min*. Clicking it narrows the card and the map to exactly those reports, the same way the NEW badge narrows them to what is new; clicking it again, or the other badge, lets go. **Show what the jams cost** / **Zeigen, was die Staus kosten** switches the badge off; it has its own block under **Layout → General**, with the same colour, background, font and switches the NEW marker has. With the list following the map it counts what is on screen, like the number beside it.

  In the [minimal format](#formats) the same switch draws a third part of the line instead of a badge - *+22 min* after the total and the new count, in the same red - and a tap on it opens the pop-up on those reports alone. It stays there at *0 min*, quiet and not pressable, the way the new part does at nought: a line that gained and lost a third of itself every time a jam cleared would move everything under it each time. Its own block under **Layout → General** sets its colour, its fill and its symbol, and on a narrow card the words go first, then the type steps down, so the figure is never cut off.
- **Fold a long list** after a number of entries you choose, with a chevron to open the rest.
- **Refresh on demand**, with a button at the end of the subtitle line. Worth having above all on an area set to poll manually - an update interval of `0`.
- **A tap action in the minimal format.** Home Assistant's own set: more-info, navigate, URL, an action, toggle, or nothing. Left on **Default** the tap opens the pop-up, which is what the format is for.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-card-route-delay.png" alt="A route entry on the card: the red badge adding up what the jams cost, switched on so that card, list and map show only the reports costing time - two tailbacks with their queue length, speed and delay" width="50%">

### Settings

Two panels, each with three groups:

- **Settings** - *General, Content, List*: what the card shows.
- **Layout** - *General, Map, List*: how it is drawn. One collapsible block per element - the title, the badges, each line of an entry, the dropdowns, the rule between entries - with colour, typeface, size and, where the element has one, its symbol.

Every field carries an **i** describing it, so the reference for its roughly 220 settings is the editor itself. The editor writes only what differs from the default, so a card configured entirely in the interface stays short in YAML.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/blitzer-card-custom.png" alt="The same three formats restyled: coloured badges, a renamed title, a background image, other symbols, underlined addresses, confirmation stars and recoloured counters" width="100%">

The same card, the same area, the same data - and not a line of CSS. Everything above was set in the **Layout** panel.

### YAML

The whole of a working card:

<details>
<summary>YAML</summary>

```yaml
type: custom:blitzer-card
```

</details>

One pinned to an area, minimal, tapping through to the map dashboard:

<details>
<summary>YAML</summary>

```yaml
type: custom:blitzer-card
layout: minimal
areas:
  - 4f2c1b9d8e7a6c5b4a39281706f5e4d3   # the area's device id
show_area_picker: false
mini_tap_action:
  action: navigate
  navigation_path: /lovelace/map
```

</details>

The options that decide what the card *is*, rather than how it is drawn:

| Option | Default | What it does |
|---|---|---|
| `layout` | `portrait` | `portrait`, `landscape` or `minimal`. |
| `areas` | *(all)* | Device ids of the areas to show. Empty means every configured one. |
| `title` | *(the translated default)* | The card's own title. |
| `filter` | `all` | What the card starts on: `all`, `controls` or `hazards`. |
| `sort` | `distance` | `distance`, `newest` or `oldest`. |
| `reference_mode` | `area` | Where distances are measured from: `area`, `map` or `entity`. On a route entry every distance is the way along the route from its start, whatever this says. |
| `reference` | - | The person, device tracker or zone, with `reference_mode: entity`. |
| `only_new` | `false` | Show nothing but what is still new. |
| `show_max` / `max` | `false` / `5` | Cap how many reports are listed. |
| `collapse_list` / `collapse_after` | `false` / `3` | Fold the list after this many entries. Portrait only. |
| `show_map` / `show_list` | `true` / `true` | The two halves of the card, and of the pop-up in the minimal format. |
| `map_aspect_ratio` | `16:9` | The map's shape. |
| `map_route` | `true` | Draw a route entry's route on the map. |
| `route_color` / `route_width` | *(theme primary)* / `4` | The route line's colour and its width in pixels. |
| `cluster_color` / `cluster_text_color` | *(theme)* | The discs the map gathers nearby reports into, and the count on them. |
| `cluster_font_size` / `cluster_bold` / `cluster_italic` / `cluster_underline` | *(the map's)* / `false` | The count's size and style. |
| `follow_map` | `true` | Restrict the list to what the map shows. |
| `center_on_click` | `true` | A click on an entry centres the map on it. |
| `show_area_picker` / `show_filter_picker` | `true` / `true` | The two dropdowns. |
| `show_title` / `show_count` / `show_new` / `show_delay` / `show_sub` | `true` | The parts of the head. |
| `show_refresh` | `true` | The refresh button at the end of the subtitle line. |
| `mini_tap_action` | *(opens the pop-up)* | Minimal format: what a tap on either number does. |
| `mini_show_total` | `true` | Minimal format: show the total next to the new count. |

The rest of the keys say how a given element is drawn. Those are what the **Layout** panel writes, and the same ground is covered by the custom properties below.

### CSS variables

Every setting the **Layout** panel makes is also a custom property - bar the route line, which the card draws into the map rather than styling in CSS - so a theme can dress the card without anyone opening the editor - and so a dashboard full of these cards is styled in one place rather than card by card.

The names follow one scheme throughout:

```
--blitzer-<element>-<css-property>
```

`<element>` is the block the editor draws it in, and `<css-property>` is spelled the way CSS spells it, never abbreviated. `--blitzer-row-line2-font-size` is the font size of an entry's second line, and nothing else has to be looked up to know that.

**What wins.** A setting made in the card's editor beats the variable, and the variable beats the card's own default. So a theme sets the house style and a single card can still depart from it - and a card that was never touched follows the theme.

Set them in a theme, where Home Assistant adds the leading `--` for you:

<details>
<summary>YAML</summary>

```yaml
# themes.yaml
my_theme:
  blitzer-title-font-size: 22px
  blitzer-title-font-weight: "600"
  blitzer-row-line1-color: "#e8eaed"
  blitzer-row-line2-color: "#9aa0a6"
  blitzer-row-chip-background: "rgba(255, 255, 255, 0.08)"
  blitzer-new-background: "#ff5722"
  blitzer-divider-color: "rgba(255, 255, 255, 0.12)"
```

</details>

#### The elements

Which suffixes an element takes depends on what it is made of:

| Variable prefix | The element | Colour | Text | Background | Symbol | Size |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `--blitzer-title-` | Card title | ✓ | ✓ | | | |
| `--blitzer-sub-` | Subtitle line | ✓ | ✓ | | ✓ | |
| `--blitzer-count-` | Number of reports shown | ✓ | ✓ | ✓ | | |
| `--blitzer-new-` | New marker - the badge, and the tag in the card's own list | ✓ | ✓ | ✓ | | |
| `--blitzer-delay-` | The delay badge beside it - what the jams cost | ✓ | ✓ | ✓ | | |
| `--blitzer-no-reports-` | Text without reports | ✓ | ✓ | | | |
| `--blitzer-area-select-` | Area dropdown | ✓ | ✓ | ✓ | | |
| `--blitzer-filter-select-` | Filter dropdown | ✓ | ✓ | ✓ | | |
| `--blitzer-refresh-` | Refresh button | | | | ✓ | |
| `--blitzer-row-picture-` | An entry's symbol | | | | | ✓ |
| `--blitzer-row-line1-` | Distance and kind | ✓ | ✓ | | | |
| `--blitzer-row-line2-` | Place | ✓ | ✓ | | ✓ | |
| `--blitzer-row-extra-` | Description | ✓ | ✓ | | ✓ | |
| `--blitzer-row-chip-` | Chips | ✓ | ✓ | ✓ | | |
| `--blitzer-row-stars-` | Stars | ✓ | | | | ✓ |
| `--blitzer-mini-total-` | Minimal format: the total | ✓ | ✓ | | ✓ | |
| `--blitzer-mini-new-` | Minimal format: what is new | ✓ | ✓ | | ✓ | |
| `--blitzer-mini-delay-` | Minimal format: what the jams cost | ✓ | ✓ | | ✓ | |
| `--blitzer-pop-new-` | New marker on an entry of the pop-up's list | ✓ | ✓ | ✓ | | |
| `--blitzer-cluster-` | Grouped reports on the map: the count on the disc, and with `-background` the disc itself | ✓ | ✓ | ✓ | | |

| Column | Suffixes |
|---|---|
| Colour | `-color` |
| Text | `-font-size`, `-font-weight`, `-font-style`, `-text-transform`, `-text-decoration`, `-letter-spacing` |
| Background | `-background` |
| Symbol | `-icon-color`, `-icon-size` |
| Size | `-size` |

So `--blitzer-sub-icon-size` exists and `--blitzer-title-icon-size` does not, because the title has no symbol.

The grouped reports are the one element drawn by Home Assistant's map rather than by the card, inside the map's own stylesheet. The properties reach it all the same - set on the card, they are inherited into the map - and each falls back to the map's own declaration, so an unset one changes nothing there either.

#### On their own

Nine more, where one property is the whole of what the element is:

| Variable | What it does |
|---|---|
| `--blitzer-card-background-color` | A colour behind the whole card - in the minimal format, behind its pop-up. |
| `--blitzer-card-background-image` | An image behind it, as a `url(...)`. |
| `--blitzer-card-background-size` | `cover`, `contain`, or a length. |
| `--blitzer-card-background-repeat` | `no-repeat`, `repeat`, ... |
| `--blitzer-card-background-opacity` | `0` to `1`, on the background alone rather than on the card. |
| `--blitzer-divider-color` | The rule between two entries. |
| `--blitzer-divider-width` | Its thickness. |
| `--blitzer-divider-style` | `solid`, `dashed`, `dotted`. |
| `--blitzer-highlight-background` | What backs the entry whose report was clicked on the map. |

And six for the three parts of the minimal line, which are filled rather than drawn on:

| Variable | What it does |
|---|---|
| `--blitzer-mini-total-fill-color` | The colour behind the total. |
| `--blitzer-mini-total-fill-opacity` | Its opacity, `0` to `1`. |
| `--blitzer-mini-new-fill-color` | The colour behind the new count. Preset to the accent colour. |
| `--blitzer-mini-new-fill-opacity` | Its opacity. Preset to `0.14`. |
| `--blitzer-mini-delay-fill-color` | The colour behind what the jams cost. Preset to the theme's error colour. |
| `--blitzer-mini-delay-fill-opacity` | Its opacity. Preset to `0.14`. |

159 in all, and none of them changes anything until it is set: an unset property falls back to the card's own stylesheet rather than to nothing.

## Map card

Everything an area reports is a `geo_location` entity carrying an `area` attribute. It therefore shows up natively on the [map card](https://www.home-assistant.io/dashboards/map/), with Blitzer.de's own symbol rather than a generic marker.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/map-card-example-1.png" alt="Map card showing an area's speed controls, each with its own symbol and speed limit" width="45%"> <img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/map-card-example-2.png" alt="Map card showing an area's hazards - a tailback, an accident and a police report" width="45%">

Each area gets **two** sources of its own, one per half: `blitzer_<area>_controls` and `blitzer_<area>_hazards`. The `<area>` part is the display name, lowercased and slugified, e.g. `blitzer_berlin_controls`.

That lets a map card show one area, one half, or any combination, instead of all of them at once:

<details>
<summary>YAML</summary>

```yaml
type: map
geo_location_sources:
  - blitzer_berlin_controls
entities:
  - zone.home
```

</details>

Use `geo_location_sources: [all]`, or list the sources by name, to show several areas on one map.

Listing both halves of an area puts them on one map, still individually removable:

<details>
<summary>YAML</summary>

```yaml
type: map
geo_location_sources:
  - blitzer_berlin_controls
  - blitzer_berlin_hazards
entities:
  - zone.home
```

</details>

**Showing a figure instead of the symbol.** The map card's `label_mode: attribute` writes an attribute into the marker - a tailback's `delay_minutes`, for instance. It replaces the symbol rather than joining it. The marker fits about two or three characters, so leave `unit` unset:

<details>
<summary>YAML</summary>

```yaml
type: map
auto_fit: true
entities:
  - entity: geo_location.berlin_gefahr_a103
    label_mode: attribute
    attribute: delay_minutes
    color: orange
```

</details>

Set on a whole `geo_location_sources` entry, it labels every hazard - including those with no delay to show, which then read "Unknown". It works best pointed at specific reports.

## Markdown card

One list for everything an area reports, controls and hazards side by side, sorted by distance and closest first.

Each entry is up to three lines. What it is and where; the free text Blitzer.de adds where there is one; and finally when it was reported, when it was last confirmed, and how many of the three community confirmations it carries. The address links straight to that report on blitzer.de's map.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/markdown-card-example-1-de.png" alt="Markdown card listing an area's controls, German wording" width="45%"> <img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/markdown-card-example-2-de.png" alt="Markdown card listing hazards along a route, German wording" width="45%">

The card reads `summary` rather than assembling the fields itself. That is what lets one template serve both halves without knowing which it has. Everything after the ` — ` moves to a smaller line of its own, and the last `·` segment is the address, which becomes the link.

`Bestätigt` is dropped for a fixed installation, whose `confirmed` is `01.01.1970` because it was never community-confirmed. A value carrying a date says "Gemeldet am", one carrying a time "Gemeldet um".

The stars are `counter`, drawn with blitzer.de's own star images. They are capped at three, the way its map caps them - one control in the test data reported 16.

Three kinds of report skip the stars, because for those the number is never a community rating:

- A **fixed** installation is put up by whoever operates it. All 91 of them in the test data reported `0`.
- An **archived** record's count is a leftover from when it was still live. It says nothing about a device that no longer stands there.
- A **police report** is an official bulletin rather than a sighting.

Everything else keeps its stars, hazards included, where the count runs between one and three. This is written as an exclusion rather than a list of what qualifies, so a hazard type Blitzer.de adds later is rated instead of silently left blank.

A **police report** is also the one entry with no link. Blitzer.de's map resolves a marker by id through a lookup of its own, and that lookup returns nothing at all for a police report. Measured against three that were live in the same area query at the same moment, so this is the lookup, not a stale entity.

Every other type resolves: controls, tailbacks, both kinds of roadwork, obstacles, broken-down vehicles. A link would only ever open "keine Daten gefunden", so the address stays plain text.

<details>
<summary>YAML (German)</summary>

```jinja2
<h1></h1>
{%- set areas = ["Berlin"] -%}
{%- set ns = namespace(any=false) -%}
{%- for area in areas -%}
{%- set matches = namespace(items=[]) -%}
{%- for s in states.geo_location -%}
{%- set src = state_attr(s.entity_id, 'source') or '' -%}
{%- if src.startswith('blitzer_') and state_attr(s.entity_id, 'area') == area -%}
{%- set matches.items = matches.items + [{'id': s.entity_id, 'dist': states(s.entity_id) | float(9999)}] -%}
{%- endif -%}
{%- endfor -%}
{%- set sorted_items = matches.items | sort(attribute='dist') -%}
{%- if sorted_items | count > 0 -%}
{%- set ns.any = true -%}
<b>{{ area }} ({{ sorted_items | count }})</b><br>
{%- for m in sorted_items -%}
{%- set e = m.id -%}
{%- set summary = state_attr(e, 'summary') or '' -%}
{%- set head = summary.split(' — ')[0] -%}
{%- set extra = summary.split(' — ')[1:] | join(' — ') -%}
{%- set parts = head.split(' · ') -%}
{%- set place = parts[-1] -%}
{%- set street = state_attr(e, 'street') or '' -%}
{%- set city = state_attr(e, 'city') or '' -%}
{%- set linkable = parts | count > 1 and state_attr(e, 'type') != 'police_report'
                   and ((street and street in place) or (city and city in place)) -%}
{%- set created = state_attr(e, 'created') or '' -%}
{%- set confirmed = state_attr(e, 'confirmed') or '' -%}
{%- set stamped = created or (confirmed and confirmed != '01.01.1970') -%}
{%- set rateable = state_attr(e, 'type') not in ['fixed', 'archive', 'police_report'] -%}
{%- set stars = [state_attr(e, 'counter') | int(0), 3] | min -%}
<img src="{{ state_attr(e, 'entity_picture') }}" width="30">
<b>{{ states(e) }} km</b> ·
{%- if linkable %} {{ parts[:-1] | join(' · ') }} · <a href="https://map.blitzer.de/v5/ID/{{ state_attr(e, 'id') }}/">{{ place }}</a>
{%- else %} {{ head }}
{%- endif %}<br>
{%- if extra %}<small>ℹ️ {{ extra }}</small><br>{% endif -%}
{%- if stamped %}<small>🕒
{%- if created %} Gemeldet {{ 'am' if '.' in created else 'um' }} {{ created }}{% endif -%}
{%- if confirmed and confirmed != '01.01.1970' %}{{ ' · ' if created else ' ' }}Bestätigt {{ 'am' if '.' in confirmed else 'um' }} {{ confirmed }}
{%- if rateable %} ·&nbsp;
{%- for _ in range(stars) %}<img src="https://map.blitzer.de/v5/images/star_full.svg" width="12">{% endfor -%}
{%- for _ in range(3 - stars) %}<img src="https://map.blitzer.de/v5/images/star_contour.svg" width="12">{% endfor -%}
{%- endif -%}
{%- endif %}</small><br>
{%- endif -%}
<br>
{%- endfor -%}
{%- endif -%}
{%- endfor -%}

{%- if not ns.any -%}
Aktuell nichts gemeldet 🚗💨
{%- endif -%}
```

</details>

The same card with English wording. `summary` and `type_name` follow the **server** language under **Settings → System → General**, so set that to English too. Otherwise the two halves of a line will not match.

<img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/markdown-card-example-1-en.png" alt="Markdown card listing an area's controls, English wording" width="45%"> <img src="https://raw.githubusercontent.com/somansch/blitzer/main/docs/markdown-card-example-2-en.png" alt="Markdown card listing hazards along a route, English wording" width="45%">

<details>
<summary>YAML (English)</summary>

```jinja2
<h1></h1>
{%- set areas = ["Berlin"] -%}
{%- set ns = namespace(any=false) -%}
{%- for area in areas -%}
{%- set matches = namespace(items=[]) -%}
{%- for s in states.geo_location -%}
{%- set src = state_attr(s.entity_id, 'source') or '' -%}
{%- if src.startswith('blitzer_') and state_attr(s.entity_id, 'area') == area -%}
{%- set matches.items = matches.items + [{'id': s.entity_id, 'dist': states(s.entity_id) | float(9999)}] -%}
{%- endif -%}
{%- endfor -%}
{%- set sorted_items = matches.items | sort(attribute='dist') -%}
{%- if sorted_items | count > 0 -%}
{%- set ns.any = true -%}
<b>{{ area }} ({{ sorted_items | count }})</b><br>
{%- for m in sorted_items -%}
{%- set e = m.id -%}
{%- set summary = state_attr(e, 'summary') or '' -%}
{%- set head = summary.split(' — ')[0] -%}
{%- set extra = summary.split(' — ')[1:] | join(' — ') -%}
{%- set parts = head.split(' · ') -%}
{%- set place = parts[-1] -%}
{%- set street = state_attr(e, 'street') or '' -%}
{%- set city = state_attr(e, 'city') or '' -%}
{%- set linkable = parts | count > 1 and state_attr(e, 'type') != 'police_report'
                   and ((street and street in place) or (city and city in place)) -%}
{%- set created = state_attr(e, 'created') or '' -%}
{%- set confirmed = state_attr(e, 'confirmed') or '' -%}
{%- set stamped = created or (confirmed and confirmed != '01.01.1970') -%}
{%- set rateable = state_attr(e, 'type') not in ['fixed', 'archive', 'police_report'] -%}
{%- set stars = [state_attr(e, 'counter') | int(0), 3] | min -%}
<img src="{{ state_attr(e, 'entity_picture') }}" width="30">
<b>{{ states(e) }} km</b> ·
{%- if linkable %} {{ parts[:-1] | join(' · ') }} · <a href="https://map.blitzer.de/v5/ID/{{ state_attr(e, 'id') }}/">{{ place }}</a>
{%- else %} {{ head }}
{%- endif %}<br>
{%- if extra %}<small>ℹ️ {{ extra }}</small><br>{% endif -%}
{%- if stamped %}<small>🕒
{%- if created %} Reported {{ 'on' if '.' in created else 'at' }} {{ created }}{% endif -%}
{%- if confirmed and confirmed != '01.01.1970' %}{{ ' · ' if created else ' ' }}Confirmed {{ 'on' if '.' in confirmed else 'at' }} {{ confirmed }}
{%- if rateable %} ·&nbsp;
{%- for _ in range(stars) %}<img src="https://map.blitzer.de/v5/images/star_full.svg" width="12">{% endfor -%}
{%- for _ in range(3 - stars) %}<img src="https://map.blitzer.de/v5/images/star_contour.svg" width="12">{% endfor -%}
{%- endif -%}
{%- endif %}</small><br>
{%- endif -%}
<br>
{%- endfor -%}
{%- endif -%}
{%- endfor -%}

{%- if not ns.any -%}
Nothing reported right now 🚗💨
{%- endif -%}
```

</details>

## Installation

Needs Home Assistant **2024.7** or newer.

### What you get

Three things, in one download:

- The **integration** itself.
- The **[Blitzer card](#blitzer-card)**. Served by the integration and handed to every dashboard, so there is no file to copy into `www` and no resource to register.
- The **[Report Alerts blueprint](#blueprint-report-alerts)**, put into `config/blueprints/automation/blitzer/` on start.

That blueprint folder is the integration's own: a copy that has fallen behind is replaced when a release changes the blueprint, which is how a fix reaches you at all. A blueprint of your own belongs under a name of your own.

### HACS (recommended)

Blitzer.de is part of the default HACS integration list:

1. Open HACS in Home Assistant
2. Search for "Blitzer.de"
3. Click the "Download" button
4. Restart HA

### Manual

Download `blitzer.zip` from the [latest release](https://github.com/somansch/blitzer/releases/latest) and extract it to `config/custom_components/blitzer`:

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

This custom integration is not officially endorsed or supported by Blitzer.de. Use it at your own risk, and make sure you comply with all relevant terms of service and privacy policies.

There is no official, documented Blitzer.de API. This integration queries `cdn2.atudo.net`, the backend the Blitzer.de map application uses internally. A number of other long-standing community projects - for Home Assistant, ioBroker, FHEM and others - do the same. It is not a sanctioned integration point.

Blitzer.de's terms of use grant only a non-exclusive, non-transferrable license for private use of their apps. They explicitly prohibit reverse-engineering those apps and using their traffic data "in any way without our written consent or license". Using this integration is likely a violation of those terms in the strict sense, even though there is no indication of Blitzer.de having taken action against the existing ecosystem of similar tools. Use it at your own legal risk.
