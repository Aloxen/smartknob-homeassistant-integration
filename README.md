# SmartKnob — Home Assistant Custom Integration

Custom integration to connect and configure the [SmartKnob](https://github.com/scottbez1/smartknob) with Home Assistant.

## Features

- **Push Configuration via WebSocket**: Real-time push of menu structures and screen layouts to the ESP32.
- **Config Flow & Options Flow**: Easy device setup (name + IP) and an integrated YAML editor for configuring screens, submenus, and sensor assignments.
- **Interactive Screens Supported**:
  - `brightness`: Control WLED or any Home Assistant light with realtime sync and presets.
  - `switch`: Control switches with optional power monitoring and confirmation dialogues.
  - `info`: Display values, gauges, and historical line charts.
- **Bi-directional State Sync**: Automatic state update reflection on the SmartKnob display over WebSocket.

## Installation via HACS

1. In Home Assistant, open **HACS** > **Integrations**.
2. Click the three dots in the top right > **Custom repositories**.
3. Add `https://github.com/Aloxen/smartknob-homeassistant-integration` with category **Integration**.
4. Click **Download** and restart Home Assistant.
5. In **Settings** > **Devices & Services**, click **Add Integration** and search for **SmartKnob**.
