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

BLUEPRINT_DIR = "blueprints"


async def async_register_card(hass: HomeAssistant) -> None:
    """Serve the card and have every dashboard load it.

    "add_extra_js_url" rather than a Lovelace resource: a resource has to be
    written into the user's own resource list, which only exists on
    storage-mode dashboards and which we would then have to keep tidy on
    removal. An extra module URL is ours for as long as the integration is
    loaded and gone with it.
    """
    source = Path(__file__).parent / "frontend" / CARD_FILE
    url = f"{CARD_URL_BASE}/{CARD_FILE}"

    await hass.http.async_register_static_paths(
        [StaticPathConfig(url, str(source), False)]
    )

    # The version as a query string, so a browser holding the previous card
    # fetches the new one after an update - rather than after a hard reload
    # the user would have to know to do.
    integration = await async_get_integration(hass, DOMAIN)
    add_extra_js_url(hass, f"{url}?v={integration.version}")


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
