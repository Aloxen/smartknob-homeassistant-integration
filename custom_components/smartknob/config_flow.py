"""Config flow for SmartKnob integration."""
from __future__ import annotations

import logging
from typing import Any
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_DEVICE_NAME,
    CONF_DEVICE_IP,
)

_LOGGER = logging.getLogger(__name__)


class SmartKnobConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SmartKnob."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle initial user step to add a SmartKnob device."""
        errors: dict[str, str] = {}

        if user_input is not None:
            device_ip = user_input[CONF_DEVICE_IP].strip()
            device_name = user_input[CONF_DEVICE_NAME].strip()

            await self.async_set_unique_id(device_ip)
            self._abort_if_unique_id_configured()

            return self.async_create_entry(
                title=device_name,
                data={
                    CONF_DEVICE_NAME: device_name,
                    CONF_DEVICE_IP: device_ip,
                },
            )

        data_schema = vol.Schema({
            vol.Required(CONF_DEVICE_NAME, default="Wohnzimmer Knob"): cv.string,
            vol.Required(CONF_DEVICE_IP, default="192.168.178.133"): cv.string,
        })

        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create options flow handler."""
        return SmartKnobOptionsFlowHandler(config_entry)


class SmartKnobOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for SmartKnob (device settings)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        super().__init__()
        self._config_entry = config_entry

    @property
    def config_entry(self) -> config_entries.ConfigEntry:
        """Return config entry."""
        return self._config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the device options."""
        if user_input is not None:
            self.hass.config_entries.async_update_entry(
                self.config_entry,
                data={
                    **self.config_entry.data,
                    **user_input,
                },
            )
            return self.async_create_entry(title="", data={})

        current_name = self.config_entry.data.get(CONF_DEVICE_NAME, "SmartKnob")
        current_ip = self.config_entry.data.get(CONF_DEVICE_IP, "")

        options_schema = vol.Schema({
            vol.Required(CONF_DEVICE_NAME, default=current_name): cv.string,
            vol.Required(CONF_DEVICE_IP, default=current_ip): cv.string,
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema,
        )
