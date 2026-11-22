"""Config flow for SmartKnob integration."""
from __future__ import annotations

import logging
import os
from typing import Any
import voluptuous as vol
import yaml

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector
import homeassistant.helpers.config_validation as cv

from .const import (
    DOMAIN,
    CONF_DEVICE_NAME,
    CONF_DEVICE_IP,
    CONF_CONFIG_YAML,
    get_device_config_filename,
    get_default_config_yaml,
)

_LOGGER = logging.getLogger(__name__)


def _read_file_sync(path: str) -> str:
    """Read file content synchronously in executor."""
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
    except Exception as ex:
        _LOGGER.warning("Could not read file %s: %s", path, ex)
    return ""


def _write_file_sync(path: str, content: str) -> None:
    """Write file content synchronously in executor."""
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as ex:
        _LOGGER.error("Could not write file %s: %s", path, ex)


class SmartKnobConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SmartKnob."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            device_ip = user_input[CONF_DEVICE_IP].strip()
            device_name = user_input[CONF_DEVICE_NAME].strip()

            await self.async_set_unique_id(device_ip)
            self._abort_if_unique_id_configured()

            # Create default device-specific YAML file if it doesn't exist
            filename = get_device_config_filename(device_name, device_ip)
            file_path = self.hass.config.path(filename)
            default_yaml = get_default_config_yaml(device_name, device_ip)

            existing = await self.hass.async_add_executor_job(_read_file_sync, file_path)
            if not existing.strip():
                await self.hass.async_add_executor_job(_write_file_sync, file_path, default_yaml)

            user_input[CONF_CONFIG_YAML] = default_yaml

            return self.async_create_entry(
                title=device_name,
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
        super().__init__()
        self._config_entry = config_entry

    @property
    def config_entry(self) -> config_entries.ConfigEntry:
        """Return config entry."""
        return self._config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}

        device_name = self.config_entry.data.get(CONF_DEVICE_NAME, "SmartKnob")
        device_ip = self.config_entry.data.get(CONF_DEVICE_IP, "")
        filename = get_device_config_filename(device_name, device_ip)
        file_path = self.hass.config.path(filename)

        if user_input is not None:
            raw_yaml = user_input.get(CONF_CONFIG_YAML, "")
            try:
                parsed = yaml.safe_load(raw_yaml)
                if not isinstance(parsed, dict):
                    errors["base"] = "invalid_yaml_structure"
            except yaml.YAMLError:
                errors["base"] = "invalid_yaml"

            if not errors:
                # Save to device YAML file in HA config directory
                await self.hass.async_add_executor_job(_write_file_sync, file_path, raw_yaml)
                return self.async_create_entry(title="", data=user_input)

        # Read from device-specific file or fallback
        current_yaml = await self.hass.async_add_executor_job(_read_file_sync, file_path)
        if not current_yaml.strip():
            current_yaml = self.config_entry.options.get(
                CONF_CONFIG_YAML,
                self.config_entry.data.get(
                    CONF_CONFIG_YAML, get_default_config_yaml(device_name, device_ip)
                ),
            )

        options_schema = vol.Schema({
            vol.Required(CONF_CONFIG_YAML, default=current_yaml): selector.TextSelector(
                selector.TextSelectorConfig(multiline=True)
            ),
        })

        return self.async_show_form(
            step_id="init",
            data_schema=options_schema,
            errors=errors,
            description_placeholders={
                "device_name": device_name,
                "filename": filename,
            },
        )
