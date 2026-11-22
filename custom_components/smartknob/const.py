"""Constants for the SmartKnob integration."""
from __future__ import annotations

import re

DOMAIN = "smartknob"

CONF_DEVICE_NAME = "device_name"
CONF_DEVICE_IP = "device_ip"
CONF_CONFIG_YAML = "config_yaml"

EVENT_SMARTKNOB_CONFIG = "smartknob_config"
SERVICE_PUSH_CONFIG = "push_config"


def get_device_config_filename(device_name: str, device_ip: str) -> str:
    """Generate a clean filename like smartknob_wohnzimmer_knob.yaml."""
    slug = re.sub(r"[^a-zA-Z0-9_]+", "_", device_name.strip().lower()).strip("_")
    if not slug:
        slug = re.sub(r"[^a-zA-Z0-9_]+", "_", device_ip.strip())
    return f"smartknob_{slug}.yaml"


def get_default_config_yaml(device_name: str, device_ip: str) -> str:
    """Return default YAML template tailored for this device."""
    return f"""smartknob:
  device:
    name: "{device_name}"
    ip: "{device_ip}"

  menu:
    - label: "{device_name}"
      icon: lightbulb
      color: "#FFAA00"
      type: submenu
      children:
        - label: "Helligkeit"
          icon: brightness
          color: "#FFAA00"
          type: screen
          screen: brightness
          entity_id: light.wohnzimmer_wled
          options:
            presets:
              - {{ label: "Rainbow", preset: "1", color: "#FF00FF" }}
              - {{ label: "Cozy",    preset: "2", color: "#FF6600" }}

        - label: "Steckdose"
          icon: power
          color: "#FFFFFF"
          type: screen
          screen: switch
          entity_id: switch.stehlampe
          options:
            power_sensor: sensor.stehlampe_power
            power_threshold: 60

        - label: "Energie"
          icon: info
          color: "#00CCFF"
          type: screen
          screen: info
          options:
            items:
              - {{ label: "Verbrauch", type: value, entity_id: sensor.stromverbrauch, unit: "W" }}
              - {{ label: "Heute",     type: gauge, entity_id: sensor.energie_heute, unit: "kWh", min: 0, max: 20 }}
              - {{ label: "Verlauf",   type: chart, entity_id: sensor.stromverbrauch, time_range_hours: 24 }}
"""


DEFAULT_CONFIG_YAML = get_default_config_yaml("Wohnzimmer Knob", "192.168.178.133")
