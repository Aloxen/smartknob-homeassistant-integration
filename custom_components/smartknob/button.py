"""Button entity for SmartKnob."""
from __future__ import annotations

import logging
from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, CONF_DEVICE_NAME
from .coordinator import SmartKnobCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartKnob button platform."""
    coordinator: SmartKnobCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([SmartKnobPushConfigButton(coordinator, entry)])


class SmartKnobPushConfigButton(ButtonEntity):
    """Button entity that pushes the current configuration to the SmartKnob."""

    _attr_has_entity_name = True
    _attr_name = "Konfiguration senden"
    _attr_icon = "mdi:upload-network"

    def __init__(
        self,
        coordinator: SmartKnobCoordinator,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the button."""
        self._coordinator = coordinator
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_push_config"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": coordinator.device_name,
            "manufacturer": "scottbez1 / SmartKnob",
            "model": "SmartKnob View",
        }

    async def async_press(self) -> None:
        """Handle the button press."""
        _LOGGER.info("Push Config button pressed for %s", self._coordinator.device_name)
        await self._coordinator.async_push_config()
