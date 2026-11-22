"""Config flow for SmartKnob integration."""
from __future__ import annotations

import logging
from typing import Any
import voluptuous as vol
import yaml

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_DEVICE_NAME,
    CONF_DEVICE_IP,
    CONF_CONFIG_YAML,
    DEFAULT_CONFIG_YAML,
)

_LOGGER = logging.getLogger(__name__)


class SmartKnobConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SmartKnob."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            # Set unique ID based on IP or name
            device_ip = user_input[CONF_DEVICE_IP].strip()
            await self.async_set_unique_id(device_ip)
            self._abort_if_unique_id_configured()

            user_input[CONF_CONFIG_YAML] = DEFAULT_CONFIG_YAML

            return self.async_create_entry(
                title=user_input[CONF_DEVICE_NAME],
                data=user_input,
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
    """Handle options flow for SmartKnob (YAML Editor and screen settings)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}

        if user_input is not None:
            raw_yaml = user_input.get(CONF_CONFIG_YAML, "")
            try:
                parsed = yaml.safe_load(raw_yaml)
                if not isinstance(parsed, dict):
                    errors["base"] = "invalid_yaml_structure"
            except yaml.YAMLError:
                errors["base"] = "invalid_yaml"

            if not errors:
                return self.async_create_entry(title="", data=user_input)

        current_yaml = self.config_entry.options.get(
            CONF_CONFIG_YAML,
            self.config_entry.data.get(CONF_CONFIG_YAML, DEFAULT_CONFIG_YAML),
        )

        options_schema = vol.Schema({
            vol.Required(CONF_CONFIG_YAML, default=current_yaml): cv.string,
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema,
            errors=errors,
        )
