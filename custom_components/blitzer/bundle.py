"""What the download brings with it: the dashboard card and the blueprint.

Both used to be a second installation of their own - a file copied into
"www" and registered as a Lovelace resource by hand, and a blueprint imported
from a URL. Neither is a separate thing to keep up to date any more: they ship
inside the integration folder and are put in place here, so an installation
has them the moment it has the integration.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import yaml

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.setup import async_when_setup

from .const import DOMAIN
from .lovelace_resource import LOVELACE_DOMAIN
from .lovelace_resource import async_register as async_register_resource

_LOGGER = logging.getLogger(__name__)

# Where the card is served from. Deliberately not "/local": that is the
# user's own "www" folder, and putting it there by hand is the step this
# replaces. The path is the domain's own, so nothing else can claim it.
CARD_URL_BASE = f"/{DOMAIN}_static"
CARD_FILE = "blitzer-card.js"
# What Home Assistant is actually told to import. See the file itself for
# why the card is not handed over directly.
CARD_LOADER_FILE = "blitzer-card-loader.js"
# The two files we serve, by name: an entry in the dashboards' resource list
# pointing at one of them is ours to keep current - see lovelace_resource.py.
CARD_RESOURCE_PATHS = (
    f"{CARD_URL_BASE}/{CARD_FILE}",
    f"{CARD_URL_BASE}/{CARD_LOADER_FILE}",
)

BLUEPRINT_DIR = "blueprints"
# What was last put in place, per blueprint: the hash of the file as it
# stood on disk afterwards, and of the version the download carried. The
# first tells a copy nobody touched from one the user changed; the second
# tells a new shipped version from the one already reported.
BLUEPRINT_STORE_KEY = f"{DOMAIN}.blueprints"
BLUEPRINT_STORE_VERSION = 1


async def async_register_card(hass: HomeAssistant) -> None:
    """Serve the card and its loader, and have every dashboard load it.

    Both ways in, under one URL: the extra module URL below, which Home
    Assistant writes into every page it serves from now on, and an entry in the
    dashboards' own resource list, which the frontend reads for itself after it
    connects. The second one covers the page that was served while Home
    Assistant was still starting, before any of this had run - see
    lovelace_resource.py, which also explains why one URL in two places is
    still only one card.
    """
    frontend = Path(__file__).parent / "frontend"
    card = frontend / CARD_FILE
    loader = frontend / CARD_LOADER_FILE

    if not card.is_file():
        # An incomplete download is the realistic way here. Worth saying
        # out loud, and worth not taking the rest of the integration down
        # over: the areas, the sensors and the map markers do not need it.
        _LOGGER.warning(
            "The bundled dashboard card is missing (%s). Everything else is "
            "set up as usual - reinstall the integration to get the card back.",
            card,
        )
        return

    paths = [StaticPathConfig(f"{CARD_URL_BASE}/{CARD_FILE}", str(card), False)]
    if loader.is_file():
        paths.append(
            StaticPathConfig(f"{CARD_URL_BASE}/{CARD_LOADER_FILE}", str(loader), False)
        )
    await hass.http.async_register_static_paths(paths)

    # What gets imported is the loader, not the card. Home Assistant makes
    # exactly one import attempt per page and never another, so a single
    # fetch that does not arrive - a restart in that moment, a proxy
    # hiccup - used to leave the card missing until the page was reloaded.
    # The loader is a few hundred bytes and fetches the card itself, for as
    # many attempts as it takes. See blitzer-card-loader.js.
    #
    # Without the loader on disk the card is handed over directly: a card
    # that cannot retry still beats no card at all.
    #
    # A cache-buster travels as a query string, so a browser holding the
    # previous card fetches the new one after an update rather than after a
    # hard reload the user would have to know to do. The loader carries it
    # over to the card's own URL. It is the files' modification time, not
    # the integration's version: a version only changes with a release,
    # while the file changes with a beta, a hotfix copied in by hand, or
    # every deploy while the card is being worked on - and under an unchanged
    # "?v=" the browser kept running the old module through all of those
    # (measured: a normal reload answered 304 with the previous body). The
    # newer of the two files decides, since either may be the one that
    # changed. Read off the event loop; it is a stat, but a stat on disk.
    def _newest_mtime() -> int:
        stamps = [card.stat().st_mtime]
        if loader.is_file():
            stamps.append(loader.stat().st_mtime)
        return int(max(stamps))

    version = await hass.async_add_executor_job(_newest_mtime)
    name = CARD_LOADER_FILE if loader.is_file() else CARD_FILE
    url = f"{CARD_URL_BASE}/{name}?v={version}"
    add_extra_js_url(hass, url)

    # The same URL in the dashboards' own resource list. The list belongs to
    # "lovelace", which may be set up before or after this integration, so this
    # waits for it rather than assuming - and on an installation that has no
    # dashboards at all it simply never runs.
    async def _list_as_resource(hass: HomeAssistant, _component: str) -> None:
        await async_register_resource(hass, url, CARD_RESOURCE_PATHS)

    async_when_setup(hass, LOVELACE_DOMAIN, _list_as_resource)


async def async_install_blueprints(hass: HomeAssistant) -> None:
    """Put every blueprint the download carries where Home Assistant looks.

    A missing blueprint is installed. One already there is replaced by a
    newer version only while it is still exactly what this integration put
    there - that is how a blueprint fix reaches an installation. A copy you
    changed is yours: it is left alone, and the log says once when a newer
    version ships that it was not installed over it.
    """
    source_root = Path(__file__).parent / BLUEPRINT_DIR
    target_root = Path(hass.config.path(BLUEPRINT_DIR))
    store: Store[dict] = Store(hass, BLUEPRINT_STORE_VERSION, BLUEPRINT_STORE_KEY)
    known = (await store.async_load() or {}).get("blueprints") or {}
    seen = await hass.async_add_executor_job(
        _install_blueprints, source_root, target_root, dict(known)
    )
    if seen != known:
        await store.async_save({"blueprints": seen})


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _install_blueprints(
    source_root: Path, target_root: Path, known: dict[str, dict[str, str]]
) -> dict[str, dict[str, str]]:
    """The file half of the above, off the event loop.

    "known" is what the last start left behind, by path below the
    blueprint folder; what comes back replaces it.
    """
    seen: dict[str, dict[str, str]] = {}
    for source in sorted(source_root.rglob("*.yaml")):
        relative = source.relative_to(source_root).as_posix()
        target = target_root / relative
        shipped = source.read_text(encoding="utf-8")
        before = known.get(relative) or {}
        record = {"disk": before.get("disk", ""), "shipped": _digest(shipped)}

        if target.is_file():
            try:
                current = target.read_text(encoding="utf-8")
            except OSError as err:
                _LOGGER.warning("Could not read blueprint %s: %s", target, err)
                if before:
                    seen[relative] = before
                continue
            if current == shipped or _same_blueprint(current, shipped):
                # Ours, possibly in Home Assistant's own formatting after an
                # import from the URL. Remember it as it stands, so a later
                # version knows it may replace it.
                seen[relative] = {**record, "disk": _digest(current)}
                continue
            if not before or _digest(current) != before.get("disk"):
                # Changed since it was put there, or there before this
                # integration kept count: either way not ours to overwrite.
                if before.get("shipped") != record["shipped"]:
                    _LOGGER.warning(
                        "Blueprint %s differs from the one this version of the "
                        "integration ships and was left as it is. To get the "
                        "shipped one, delete the file and restart Home Assistant.",
                        target,
                    )
                seen[relative] = record
                continue

        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(shipped, encoding="utf-8")
        except OSError as err:
            # Worth a line in the log and nothing more: a missing blueprint
            # is a missing convenience, not a broken integration.
            _LOGGER.warning("Could not install blueprint %s: %s", target, err)
            if before:
                seen[relative] = before
            continue

        seen[relative] = {**record, "disk": _digest(shipped)}
        _LOGGER.info("Installed blueprint %s", target)
    return seen


class _BlueprintLoader(yaml.SafeLoader):
    """Reads a blueprint far enough to compare it with another one."""


# "!input" is the blueprint format's own tag and means nothing to a plain
# YAML reader. Kept as the name it points at, which is all a comparison
# needs, and written the same way on both sides.
_BlueprintLoader.add_multi_constructor(
    "!", lambda loader, suffix, node: (suffix, node.value)
)


def _same_blueprint(current: str, shipped: str) -> bool:
    """Whether two blueprints say the same thing.

    Compared as data rather than as text, because a copy imported from a URL
    is written back by Home Assistant in its own formatting: same blueprint,
    not one character of it in the same place. Comparing the text alone
    would have us overwrite such a copy on every single start.

    Everything the file says counts, "source_url" included. That line is how
    the "re-import" button knows where to look, and an installation that
    imported this blueprint before it shipped with the integration is
    pointing at a path that has since moved.
    """
    try:
        mine = yaml.load(shipped, Loader=_BlueprintLoader)
        theirs = yaml.load(current, Loader=_BlueprintLoader)
    except yaml.YAMLError:
        # Unreadable, so there is nothing to say it is the same as ours.
        return False

    return isinstance(theirs, dict) and mine == theirs
