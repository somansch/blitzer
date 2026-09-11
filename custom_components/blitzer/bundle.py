"""What the download brings with it: the dashboard card and the blueprint.

Both used to be a second installation of their own - a file copied into
"www" and registered as a Lovelace resource, and a blueprint imported from a
URL. Neither is a separate thing to keep up to date any more: they ship
inside the integration folder and are put in place here, so an installation
has them the moment it has the integration.
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# Where the card is served from. Deliberately not "/local": that is the
# user's own "www" folder, and putting it there by hand is the step this
# replaces. The path is the domain's own, so nothing else can claim it.
CARD_URL_BASE = f"/{DOMAIN}_static"
CARD_FILE = "blitzer-card.js"
# What Home Assistant is actually told to import. See the file itself for
# why the card is not handed over directly.
CARD_LOADER_FILE = "blitzer-card-loader.js"

BLUEPRINT_DIR = "blueprints"


async def async_register_card(hass: HomeAssistant) -> None:
    """Serve the card and its loader, and have every dashboard load it.

    "add_extra_js_url" rather than a Lovelace resource: a resource has to be
    written into the user's own resource list, which only exists on
    storage-mode dashboards and which we would then have to keep tidy on
    removal. An extra module URL is ours for as long as the integration is
    loaded and gone with it.
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
    # The version travels as a query string, so a browser holding the
    # previous card fetches the new one after an update rather than after a
    # hard reload the user would have to know to do. The loader carries it
    # over to the card's own URL.
    integration = await async_get_integration(hass, DOMAIN)
    name = CARD_LOADER_FILE if loader.is_file() else CARD_FILE
    add_extra_js_url(hass, f"{CARD_URL_BASE}/{name}?v={integration.version}")


async def async_install_blueprints(hass: HomeAssistant) -> None:
    """Put every blueprint the download carries where Home Assistant looks.

    The folder is named after this integration, and what is in it is ours:
    an outdated copy is replaced rather than left standing, which is how a
    blueprint fix reaches an installation at all. That includes a copy
    imported from the URL in the README - it is rewritten once, on the
    update that changes the blueprint, and matches from then on. A blueprint
    of your own belongs under a name of your own.
    """
    source_root = Path(__file__).parent / BLUEPRINT_DIR
    target_root = Path(hass.config.path(BLUEPRINT_DIR))
    await hass.async_add_executor_job(_install_blueprints, source_root, target_root)


def _install_blueprints(source_root: Path, target_root: Path) -> None:
    """The file half of the above, off the event loop."""
    for source in sorted(source_root.rglob("*.yaml")):
        target = target_root / source.relative_to(source_root)
        shipped = source.read_text(encoding="utf-8")

        if target.is_file():
            try:
                current = target.read_text(encoding="utf-8")
            except OSError as err:
                _LOGGER.warning("Could not read blueprint %s: %s", target, err)
                continue
            if current == shipped or _same_blueprint(current, shipped):
                continue

        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(shipped, encoding="utf-8")
        except OSError as err:
            # Worth a line in the log and nothing more: a missing blueprint
            # is a missing convenience, not a broken integration.
            _LOGGER.warning("Could not install blueprint %s: %s", target, err)
            continue

        _LOGGER.info("Installed blueprint %s", target)


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
