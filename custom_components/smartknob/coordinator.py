"""Coordinator and push logic for SmartKnob."""
from __future__ import annotations

import logging
import os
import yaml
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    DOMAIN,
    CONF_CONFIG_YAML,
    CONF_DEVICE_IP,
    CONF_DEVICE_NAME,
    EVENT_SMARTKNOB_CONFIG,
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


class SmartKnobCoordinator(DataUpdateCoordinator):
    """Class to manage SmartKnob configuration and event dispatching."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize."""
        super().__init__(
            hass,
            _LOGGER,
            name=f"SmartKnob ({entry.data.get(CONF_DEVICE_NAME, 'Knob')})",
        )
        self.entry = entry

    @property
    def device_name(self) -> str:
        """Return the device name."""
        return self.entry.data.get(CONF_DEVICE_NAME, "SmartKnob")

    @property
    def device_ip(self) -> str:
        """Return the device IP."""
        return self.entry.data.get(CONF_DEVICE_IP, "")

    @property
    def config_filename(self) -> str:
        """Return the device-specific YAML filename (e.g. smartknob_wohnzimmer_knob.yaml)."""
        return get_device_config_filename(self.device_name, self.device_ip)

    @property
    def config_file_path(self) -> str:
        """Return the full path to the device config file."""
        return self.hass.config.path(self.config_filename)

    async def async_get_config_yaml(self) -> str:
        """Read the device-specific YAML file (or create default template)."""
        file_path = self.config_file_path
        content = await self.hass.async_add_executor_job(_read_file_sync, file_path)
        if content.strip():
            return content

        default_yaml = get_default_config_yaml(self.device_name, self.device_ip)
        await self.hass.async_add_executor_job(_write_file_sync, file_path, default_yaml)
        return default_yaml

    async def async_parse_config(self) -> dict:
        """Parse current YAML config into dict format expected by ESP32."""
        yaml_content = await self.async_get_config_yaml()
        raw = yaml.safe_load(yaml_content) or {}
        if "smartknob" in raw:
            raw = raw["smartknob"]
        return raw

    async def async_push_config(self) -> bool:
        """Push the configuration to SmartKnob over the HA event bus."""
        try:
            config_dict = await self.async_parse_config()
            event_data = {
                "device_id": self.entry.entry_id,
                "device_name": self.device_name,
                "device_ip": self.device_ip,
                "config": config_dict,
            }
            self.hass.bus.async_fire(EVENT_SMARTKNOB_CONFIG, event_data)
            _LOGGER.info(
                "Pushed SmartKnob config for %s (%s) from %s to event bus",
                self.device_name,
                self.device_ip,
                self.config_filename,
            )
            return True
        except Exception as ex:
            _LOGGER.error("Failed to parse and push SmartKnob config: %s", ex)
            return False
