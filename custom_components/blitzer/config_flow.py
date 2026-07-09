import voluptuous as vol
import logging

from homeassistant.config_entries import (
    ConfigFlow,
    OptionsFlowWithConfigEntry,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from aiohttp import ClientError, ClientResponseError, ClientSession
from homeassistant.core import callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers.selector import selector

from .const import DOMAIN

from homeassistant.const import (
    CONF_LOCATION,
    CONF_NAME,
    CONF_COUNT,
    CONF_TYPE,
    CONF_SELECTOR,
    CONF_CONDITION
)

_LOGGER = logging.getLogger(__name__)

class BlitzerdeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 4

    def __init__(self) -> None:
        """Initialize the config flow."""

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            if CONF_LOCATION not in user_input: #default location
                return self.async_abort(reason="location_missing")

            return self.async_create_entry(title=f"Blitzer.de {user_input[CONF_NAME]}", data={
                CONF_NAME: user_input[CONF_NAME],
                CONF_TYPE: user_input[CONF_TYPE],
                CONF_LOCATION: user_input[CONF_LOCATION],
                CONF_COUNT: user_input['optional'][CONF_COUNT],
                CONF_SELECTOR: user_input['optional'][CONF_SELECTOR],
                CONF_CONDITION: user_input['optional'][CONF_CONDITION]
            })

        data_schema = {
            vol.Required(CONF_NAME): str
        }
        data_schema[CONF_LOCATION] = selector({
            "location": {
                "radius": True
            }
        })
        data_schema[vol.Required(CONF_TYPE)] = section(
            vol.Schema(
                {
                    vol.Required("mobile", default=True): bool,
                    vol.Required("trailer", default=True): bool,
                    vol.Required("fixed", default=False): bool
                }
            ),
            # Whether or not the section is initially collapsed (default = False)
            {"collapsed": True},
        )
        data_schema[vol.Required('optional')] = section(
            vol.Schema(
                {
                    vol.Required(CONF_COUNT, default=9): int,
                    vol.Required(CONF_SELECTOR, default=".*"): str,
                    vol.Required(CONF_CONDITION, default=True): bool
                }
            ),
            # Whether or not the section is initially collapsed (default = False)
            {"collapsed": True},
        )
        return self.async_show_form(step_id="user", data_schema=vol.Schema(data_schema))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for Met."""
        return BlitzerdeOptionsFlow(config_entry)


class BlitzerdeOptionsFlow(OptionsFlowWithConfigEntry):

    def __init__(self, config_entry) -> None:
        """Initialize options flow."""
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Configure options for Met."""

        if user_input is not None:
            # Update config entry with data from user input
            if CONF_LOCATION not in user_input: #default location
                user_input[CONF_LOCATION] = self.config_entry.data.get(CONF_LOCATION)

            data = {
                CONF_NAME: self.config_entry.data.get(CONF_NAME),
                CONF_COUNT: self.config_entry.data.get(CONF_COUNT),
                CONF_TYPE: user_input[CONF_TYPE],
                CONF_LOCATION: user_input[CONF_LOCATION],
                CONF_SELECTOR: user_input['optional'][CONF_SELECTOR],
                CONF_CONDITION: user_input['optional'][CONF_CONDITION]
            }
            self.hass.config_entries.async_update_entry(
                self._config_entry, data=data
            )
            return self.async_create_entry(
                title=self._config_entry.title, data=data
            )

        data_schema = {}
        data_schema[CONF_LOCATION] = selector({
            "location": {
                "radius": True
            }
        })
        data_schema[vol.Required(CONF_TYPE)] = section(
            vol.Schema(
                {
                    vol.Required("mobile", default=self.config_entry.data.get(CONF_TYPE)["mobile"]): bool,
                    vol.Required("trailer", default=self.config_entry.data.get(CONF_TYPE)["trailer"]): bool,
                    vol.Required("fixed", default=self.config_entry.data.get(CONF_TYPE)["fixed"]): bool
                }
            ),
            # Whether or not the section is initially collapsed (default = False)
            {"collapsed": True},
        )
        data_schema[vol.Required('optional')] = section(
            vol.Schema(
                {
                    vol.Required(CONF_SELECTOR, default=self.config_entry.data.get(CONF_SELECTOR)): str,
                    vol.Required(CONF_CONDITION, default=self.config_entry.data.get(CONF_CONDITION)): bool
                }
            ),
            # Whether or not the section is initially collapsed (default = False)
            {"collapsed": True},
        )
        return self.async_show_form(step_id="init", data_schema=vol.Schema(data_schema))
