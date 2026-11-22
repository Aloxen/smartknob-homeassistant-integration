/**
 * SmartKnob Studio — Visual Screen & Menu Builder for Home Assistant
 * Full-page sidebar panel with visual tree hierarchy, entity pickers, and live 240x240 circular preview.
 */

class SmartKnobPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._hass = null;
    this._devices = [];
    this._selectedEntryId = null;
    this._currentDevice = null;
    this._config = { menu: [] };
    this._navStack = []; // Navigation path for submenus: [ { title: "Hauptmenü", items: [...] } ]
    this._selectedItemIndex = null;
    this._previewIndex = 0;
    this._showAddModal = false;
    this._showYamlModal = false;
    this._saving = false;
    this._statusMessage = null;
  }

  set hass(hass) {
    const firstHass = !this._hass;
    this._hass = hass;
    if (firstHass) {
      this._loadDevices();
    }
  }

  connectedCallback() {
    this._render();
    if (this._hass && this._devices.length === 0) {
      this._loadDevices();
    }
  }

  async _loadDevices() {
    if (!this._hass) return;
    try {
      const resp = await this._hass.callWS({ type: "smartknob/get_devices" });
      this._devices = resp.devices || [];
      if (this._devices.length > 0) {
        if (!this._selectedEntryId) {
          this._selectedEntryId = this._devices[0].entry_id;
        }
        await this._loadConfig(this._selectedEntryId);
      } else {
        this._render();
      }
    } catch (e) {
      console.error("SmartKnob: Failed to load devices", e);
      this._showMessage("Fehler beim Laden der Geräte: " + e.message, "error");
    }
  }

  async _loadConfig(entryId) {
    if (!this._hass || !entryId) return;
    try {
      const resp = await this._hass.callWS({
        type: "smartknob/get_config",
        entry_id: entryId,
      });
      this._currentDevice = {
        name: resp.name,
        ip: resp.ip,
        filename: resp.filename,
      };
      const rawCfg = resp.config || {};
      this._config = {
        device: rawCfg.device || { name: resp.name, ip: resp.ip },
        menu: Array.isArray(rawCfg.menu) ? rawCfg.menu : [],
      };
      this._navStack = [{ title: "Hauptmenü", items: this._config.menu }];
      this._selectedItemIndex = null;
      this._previewIndex = 0;
      this._render();
      this._drawCanvasPreview();
    } catch (e) {
      console.error("SmartKnob: Failed to load config", e);
      this._showMessage("Fehler beim Laden der Konfiguration: " + e.message, "error");
    }
  }

  async _saveAndPush() {
    if (!this._hass || !this._selectedEntryId) return;
    this._saving = true;
    this._render();
    try {
      const resp = await this._hass.callWS({
        type: "smartknob/save_config",
        entry_id: this._selectedEntryId,
        config: this._config,
      });
      this._saving = false;
      this._showMessage(`✅ Konfiguration in ${resp.filename} gespeichert und an SmartKnob gesendet!`, "success");
      this._render();
      this._drawCanvasPreview();
    } catch (e) {
      this._saving = false;
      console.error("SmartKnob: Save failed", e);
      this._showMessage("Fehler beim Speichern: " + e.message, "error");
      this._render();
    }
  }

  _showMessage(msg, type = "info") {
    this._statusMessage = { text: msg, type: type };
    this._render();
    setTimeout(() => {
      if (this._statusMessage && this._statusMessage.text === msg) {
        this._statusMessage = null;
        this._render();
      }
    }, 4500);
  }

  _getCurrentLevelItems() {
    if (this._navStack.length === 0) return [];
    return this._navStack[this._navStack.length - 1].items;
  }

  _moveItem(idx, dir) {
    const items = this._getCurrentLevelItems();
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const item = items.splice(idx, 1)[0];
    items.splice(newIdx, 0, item);
    this._selectedItemIndex = newIdx;
    this._render();
    this._drawCanvasPreview();
  }

  _deleteItem(idx) {
    const items = this._getCurrentLevelItems();
    if (confirm(`Element "${items[idx].label}" wirklich löschen?`)) {
      items.splice(idx, 1);
      this._selectedItemIndex = null;
      this._render();
      this._drawCanvasPreview();
    }
  }

  _enterSubmenu(item) {
    if (!item.children) item.children = [];
    this._navStack.push({ title: item.label, items: item.children });
    this._selectedItemIndex = null;
    this._previewIndex = 0;
    this._render();
    this._drawCanvasPreview();
  }

  _navigateUp() {
    if (this._navStack.length > 1) {
      this._navStack.pop();
      this._selectedItemIndex = null;
      this._previewIndex = 0;
      this._render();
      this._drawCanvasPreview();
    }
  }

  _addItem(type) {
    const items = this._getCurrentLevelItems();
    let newItem = {};

    if (type === "submenu") {
      newItem = {
        label: "Neues Menü",
        icon: "home",
        color: "#00CCFF",
        type: "submenu",
        children: [],
      };
    } else if (type === "brightness") {
      newItem = {
        label: "Licht",
        icon: "brightness",
        color: "#FFAA00",
        type: "screen",
        screen: "brightness",
        entity_id: "",
        options: {
          presets: [
            { label: "Gemütlich", preset: "1", color: "#FF6600" },
            { label: "Hell", preset: "2", color: "#FFAA00" },
          ],
        },
      };
    } else if (type === "switch") {
      newItem = {
        label: "Schalter",
        icon: "power",
        color: "#FFFFFF",
        type: "screen",
        screen: "switch",
        entity_id: "",
        options: {
          power_sensor: "",
          power_threshold: 0,
        },
      };
    } else if (type === "info") {
      newItem = {
        label: "Info",
        icon: "info",
        color: "#00CCFF",
        type: "screen",
        screen: "info",
        options: {
          items: [
            { label: "Wert", type: "value", entity_id: "", unit: "" },
            { label: "Tacho", type: "gauge", entity_id: "", unit: "%", min: 0, max: 100 },
          ],
        },
      };
    }

    items.push(newItem);
    this._selectedItemIndex = items.length - 1;
    this._showAddModal = false;
    this._render();
    this._drawCanvasPreview();
  }

  _getEntities(domainPrefix) {
    if (!this._hass || !this._hass.states) return [];
    const all = Object.keys(this._hass.states);
    if (!domainPrefix) return all;
    return all.filter((eid) => eid.startsWith(domainPrefix + "."));
  }

  _render() {
    const items = this._getCurrentLevelItems();
    const currentBreadcrumb = this._navStack.map((n) => n.title).join(" ❯ ");
    const selectedItem = this._selectedItemIndex !== null ? items[this._selectedItemIndex] : null;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100vh;
          background: var(--primary-background-color, #111417);
          color: var(--primary-text-color, #e1e1e1);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          box-sizing: border-box;
          overflow: hidden;
        }
        * { box-sizing: border-box; }

        /* Top Header */
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: var(--card-background-color, #1a1e24);
          border-bottom: 1px solid var(--divider-color, #2a2e36);
          height: 64px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header-title {
          font-size: 20px;
          font-weight: 700;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .device-selector {
          background: #232832;
          color: #fff;
          border: 1px solid #3c4353;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 14px;
          cursor: pointer;
        }
        .file-badge {
          font-size: 12px;
          background: #252b36;
          color: #7ce38b;
          padding: 4px 10px;
          border-radius: 12px;
          border: 1px solid #324338;
          font-family: monospace;
        }
        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        button {
          background: #2a313d;
          color: #fff;
          border: 1px solid #3d4656;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: background 0.15s, border-color 0.15s;
        }
        button:hover {
          background: #363e4e;
        }
        button.primary {
          background: #0284c7;
          border-color: #0369a1;
          color: #fff;
        }
        button.primary:hover {
          background: #0369a1;
        }
        button.danger {
          background: #991b1b;
          border-color: #7f1d1d;
        }
        button.danger:hover { background: #b91c1c; }

        /* Notification Toast */
        .toast {
          position: fixed;
          top: 76px;
          right: 24px;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          z-index: 1000;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          animation: slideIn 0.2s ease-out;
        }
        .toast.success { background: #15803d; color: #fff; }
        .toast.error { background: #b91c1c; color: #fff; }
        .toast.info { background: #0369a1; color: #fff; }

        @keyframes slideIn {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        /* Layout */
        .app-body {
          display: grid;
          grid-template-columns: 420px 1fr;
          height: calc(100vh - 64px);
        }

        /* Left Column: Menu Tree */
        .left-panel {
          border-right: 1px solid var(--divider-color, #2a2e36);
          background: #14181f;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .nav-header {
          padding: 16px;
          background: #1a202a;
          border-bottom: 1px solid #2a2e36;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .breadcrumb {
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
        }
        .item-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .menu-card {
          background: #1c222c;
          border: 1px solid #2b3342;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .menu-card:hover {
          background: #232a37;
          border-color: #3e495d;
        }
        .menu-card.active {
          border-color: #38bdf8;
          background: #1e293b;
        }
        .icon-bubble {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .card-details {
          flex: 1;
          min-width: 0;
        }
        .card-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .card-sub {
          font-size: 12px;
          color: #94a3b8;
          display: flex;
          gap: 6px;
          margin-top: 2px;
          align-items: center;
        }
        .badge {
          background: #2a3444;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 700;
        }
        .card-actions {
          display: flex;
          gap: 4px;
        }
        .btn-icon {
          background: transparent;
          border: none;
          color: #94a3b8;
          padding: 6px;
          font-size: 14px;
          border-radius: 4px;
        }
        .btn-icon:hover {
          background: #333f52;
          color: #fff;
        }
        .add-button-container {
          padding: 16px;
          border-top: 1px solid #2a2e36;
          background: #1a202a;
        }
        .add-button-container button {
          width: 100%;
          justify-content: center;
          padding: 10px;
        }

        /* Right Column: Preview & Editor */
        .right-panel {
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 24px;
          gap: 24px;
          background: #111417;
        }

        .preview-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #1a202a;
          border: 1px solid #2a2e36;
          border-radius: 12px;
          padding: 20px;
        }
        .preview-header {
          font-size: 13px;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 1px;
          color: #94a3b8;
          margin-bottom: 16px;
        }
        .knob-bezel {
          width: 270px;
          height: 270px;
          border-radius: 50%;
          background: radial-gradient(circle, #2d3440 60%, #15181f 98%, #080a0c 100%);
          box-shadow: 0 10px 30px rgba(0,0,0,0.7), inset 0 2px 6px rgba(255,255,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        canvas {
          width: 240px;
          height: 240px;
          border-radius: 50%;
          background: #000;
        }

        .editor-section {
          background: #1a202a;
          border: 1px solid #2a2e36;
          border-radius: 12px;
          padding: 20px;
        }
        .editor-title {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 16px;
          border-bottom: 1px solid #2b3342;
          padding-bottom: 8px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group.full {
          grid-column: span 2;
        }
        label {
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
        }
        input[type="text"], input[type="number"], select {
          background: #12161d;
          border: 1px solid #323b4b;
          border-radius: 6px;
          color: #fff;
          padding: 8px 12px;
          font-size: 14px;
        }
        input:focus, select:focus {
          border-color: #38bdf8;
          outline: none;
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }
        .modal {
          background: #1c222c;
          border: 1px solid #333d4e;
          border-radius: 12px;
          width: 520px;
          max-width: 90vw;
          padding: 24px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        }
        .modal-title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 16px;
        }
        .tile-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }
        .type-tile {
          background: #242c39;
          border: 2px solid #323c4d;
          border-radius: 8px;
          padding: 16px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
          transition: border-color 0.15s, background 0.15s;
        }
        .type-tile:hover {
          background: #2b3545;
          border-color: #38bdf8;
        }
        .type-tile .tile-icon { font-size: 28px; }
        .type-tile .tile-title { font-weight: 700; font-size: 14px; color: #fff; }
        .type-tile .tile-desc { font-size: 11px; color: #94a3b8; }
      </style>

      <header>
        <div class="header-left">
          <div class="header-title">🎛️ SmartKnob Studio</div>
          <select class="device-selector" id="device-select">
            ${this._devices.map((d) => `<option value="${d.entry_id}" ${d.entry_id === this._selectedEntryId ? "selected" : ""}>${d.name} (${d.ip})</option>`).join("")}
          </select>
          ${this._currentDevice ? `<span class="file-badge">📄 ${this._currentDevice.filename}</span>` : ""}
        </div>
        <div class="header-actions">
          <button id="btn-reload">🔄 Neu laden</button>
          <button class="primary" id="btn-save" ${this._saving ? "disabled" : ""}>
            ${this._saving ? "⏳ Senden..." : "💾 Speichern & an Knob senden"}
          </button>
        </div>
      </header>

      ${this._statusMessage ? `<div class="toast ${this._statusMessage.type}">${this._statusMessage.text}</div>` : ""}

      <div class="app-body">
        <!-- Left Panel: Menu Tree -->
        <div class="left-panel">
          <div class="nav-header">
            <span class="breadcrumb">${currentBreadcrumb}</span>
            ${this._navStack.length > 1 ? `<button id="btn-nav-up">⬆️ Ebene nach oben</button>` : ""}
          </div>

          <div class="item-list">
            ${items.length === 0 ? `<div style="text-align:center; padding: 40px; color:#64748b;">Noch keine Menü-Elemente.<br>Klicke unten auf <b>+ Element hinzufügen</b>.</div>` : ""}
            ${items
              .map(
                (item, idx) => `
              <div class="menu-card ${idx === this._selectedItemIndex ? "active" : ""}" data-idx="${idx}">
                <div class="icon-bubble" style="background:${item.color || "#38bdf8"}22; color:${item.color || "#38bdf8"}; border: 1px solid ${item.color || "#38bdf8"}66;">
                  ${this._getIconChar(item.icon)}
                </div>
                <div class="card-details">
                  <div class="card-title">${item.label || "Unbenannt"}</div>
                  <div class="card-sub">
                    <span class="badge">${item.type === "submenu" ? "Submenu" : item.screen}</span>
                    <span>${item.entity_id || (item.children ? item.children.length + " Items" : "")}</span>
                  </div>
                </div>
                <div class="card-actions">
                  <button class="btn-icon" data-move="-1" data-idx="${idx}" title="Nach oben">▲</button>
                  <button class="btn-icon" data-move="1" data-idx="${idx}" title="Nach unten">▼</button>
                  ${item.type === "submenu" ? `<button class="btn-icon" data-enter="${idx}" title="Untermenü öffnen">▶</button>` : ""}
                  <button class="btn-icon" data-del="${idx}" title="Löschen">✕</button>
                </div>
              </div>
            `
              )
              .join("")}
          </div>

          <div class="add-button-container">
            <button class="primary" id="btn-open-add">➕ Element hinzufügen</button>
          </div>
        </div>

        <!-- Right Panel: Live Preview & Details -->
        <div class="right-panel">
          <div class="preview-section">
            <div class="preview-header">Live 240×240 Display Vorschau</div>
            <div class="knob-bezel">
              <canvas id="display-canvas" width="240" height="240"></canvas>
            </div>
          </div>

          ${
            selectedItem
              ? `
            <div class="editor-section">
              <div class="editor-title">Eigenschaften: ${selectedItem.label} (${selectedItem.type === "submenu" ? "Untermenü" : selectedItem.screen})</div>
              <div class="form-grid">
                <div class="form-group">
                  <label>Titel / Beschriftung</label>
                  <input type="text" id="prop-label" value="${selectedItem.label || ""}">
                </div>
                <div class="form-group">
                  <label>Symbol / Icon</label>
                  <select id="prop-icon">
                    ${["lightbulb", "brightness", "power", "plug", "info", "home", "gear", "dashboard", "preset"]
                      .map((ic) => `<option value="${ic}" ${selectedItem.icon === ic ? "selected" : ""}>${ic}</option>`)
                      .join("")}
                  </select>
                </div>
                <div class="form-group">
                  <label>Akzentfarbe</label>
                  <input type="text" id="prop-color" value="${selectedItem.color || "#FFAA00"}">
                </div>

                ${
                  selectedItem.type === "screen" && selectedItem.screen === "brightness"
                    ? `
                  <div class="form-group full">
                    <label>Licht-Entität (light.*)</label>
                    <select id="prop-entity">
                      <option value="">-- Entität wählen --</option>
                      ${this._getEntities("light")
                        .map((e) => `<option value="${e}" ${selectedItem.entity_id === e ? "selected" : ""}>${e}</option>`)
                        .join("")}
                    </select>
                  </div>
                `
                    : ""
                }

                ${
                  selectedItem.type === "screen" && selectedItem.screen === "switch"
                    ? `
                  <div class="form-group full">
                    <label>Schalter-Entität (switch.* / light.*)</label>
                    <select id="prop-entity">
                      <option value="">-- Entität wählen --</option>
                      ${[...this._getEntities("switch"), ...this._getEntities("light")]
                        .map((e) => `<option value="${e}" ${selectedItem.entity_id === e ? "selected" : ""}>${e}</option>`)
                        .join("")}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Leistungssensor (optional)</label>
                    <select id="prop-power-sensor">
                      <option value="">-- Kein Sensor --</option>
                      ${this._getEntities("sensor")
                        .filter((e) => e.includes("power") || e.includes("watt") || e.includes("leistung"))
                        .map((e) => `<option value="${e}" ${selectedItem.options?.power_sensor === e ? "selected" : ""}>${e}</option>`)
                        .join("")}
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Abschalt-Warnung ab (Watt)</label>
                    <input type="number" id="prop-power-threshold" value="${selectedItem.options?.power_threshold || 0}">
                  </div>
                `
                    : ""
                }

                ${
                  selectedItem.type === "screen" && selectedItem.screen === "info"
                    ? `
                  <div class="form-group full">
                    <label>Info-Items (Wert, Tacho, Verlaufsdiagramm)</label>
                    <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">
                      Auf dem SmartKnob drehbar durchgeschaltet mit Navigations-Dots.
                    </div>
                    ${(selectedItem.options?.items || [])
                      .map(
                        (it, iIdx) => `
                      <div style="display:flex; gap:8px; align-items:center; background:#14181f; padding:8px; border-radius:6px; margin-bottom:6px;">
                        <span style="font-size:11px; font-weight:700; width:50px;">#${iIdx + 1} (${it.type})</span>
                        <input type="text" style="flex:1;" placeholder="Label" value="${it.label || ""}" data-info-idx="${iIdx}" data-info-field="label">
                        <input type="text" style="flex:2;" placeholder="Entity" value="${it.entity_id || ""}" data-info-idx="${iIdx}" data-info-field="entity_id">
                        <input type="text" style="width:60px;" placeholder="Unit" value="${it.unit || ""}" data-info-idx="${iIdx}" data-info-field="unit">
                        <button class="btn-icon" data-del-info="${iIdx}">✕</button>
                      </div>
                    `
                      )
                      .join("")}
                    <button id="btn-add-info-item" style="margin-top:6px; padding:6px 12px; font-size:12px;">+ Info-Item hinzufügen</button>
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `
              : `<div style="color:#64748b; text-align:center; padding:30px;">Wähle links ein Element aus, um dessen Eigenschaften zu bearbeiten.</div>`
          }
        </div>
      </div>

      <!-- Add Item Modal -->
      ${
        this._showAddModal
          ? `
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal">
            <div class="modal-title">Element hinzufügen</div>
            <div class="tile-grid">
              <div class="type-tile" data-add-type="brightness">
                <div class="tile-icon">💡</div>
                <div class="tile-title">Licht / Helligkeit</div>
                <div class="tile-desc">Stufenlose Helligkeit 0–100% & Presets</div>
              </div>
              <div class="type-tile" data-add-type="switch">
                <div class="tile-icon">🔌</div>
                <div class="tile-title">Schalter</div>
                <div class="tile-desc">Ein/Aus mit optionaler Leistungswarnung</div>
              </div>
              <div class="type-tile" data-add-type="info">
                <div class="tile-icon">📊</div>
                <div class="tile-title">Info / Sensor</div>
                <div class="tile-desc">Zahlenwert, Tacho oder 24h-Chart</div>
              </div>
              <div class="type-tile" data-add-type="submenu">
                <div class="tile-icon">📁</div>
                <div class="tile-title">Untermenü</div>
                <div class="tile-desc">Ordner für weitere Screen-Elemente</div>
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button id="btn-close-modal">Abbrechen</button>
            </div>
          </div>
        </div>
      `
          : ""
      }
    `;

    this._bindEvents();
    this._drawCanvasPreview();
  }

  _getIconChar(iconName) {
    const map = {
      lightbulb: "💡",
      brightness: "☀️",
      power: "⚡",
      plug: "🔌",
      info: "ℹ️",
      home: "🏠",
      gear: "⚙️",
      dashboard: "📱",
      preset: "🎨",
    };
    return map[iconName] || "⚪";
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // Device switch
    const devSelect = root.querySelector("#device-select");
    if (devSelect) {
      devSelect.addEventListener("change", (e) => {
        this._selectedEntryId = e.target.value;
        this._loadConfig(this._selectedEntryId);
      });
    }

    // Header buttons
    const btnReload = root.querySelector("#btn-reload");
    if (btnReload) btnReload.addEventListener("click", () => this._loadConfig(this._selectedEntryId));

    const btnSave = root.querySelector("#btn-save");
    if (btnSave) btnSave.addEventListener("click", () => this._saveAndPush());

    // Nav Up
    const btnNavUp = root.querySelector("#btn-nav-up");
    if (btnNavUp) btnNavUp.addEventListener("click", () => this._navigateUp());

    // Open Add Modal
    const btnOpenAdd = root.querySelector("#btn-open-add");
    if (btnOpenAdd) {
      btnOpenAdd.addEventListener("click", () => {
        this._showAddModal = true;
        this._render();
      });
    }

    // Modal Close
    const btnCloseModal = root.querySelector("#btn-close-modal");
    if (btnCloseModal) {
      btnCloseModal.addEventListener("click", () => {
        this._showAddModal = false;
        this._render();
      });
    }

    // Modal Type Select
    root.querySelectorAll(".type-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const type = tile.getAttribute("data-add-type");
        this._addItem(type);
      });
    });

    // Menu Card Click (Select item)
    root.querySelectorAll(".menu-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card-actions")) return;
        const idx = parseInt(card.getAttribute("data-idx"));
        this._selectedItemIndex = idx;
        this._previewIndex = idx;
        this._render();
        this._drawCanvasPreview();
      });
    });

    // Reorder buttons
    root.querySelectorAll("button[data-move]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-idx"));
        const dir = parseInt(btn.getAttribute("data-move"));
        this._moveItem(idx, dir);
      });
    });

    // Delete buttons
    root.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-idx"));
        this._deleteItem(idx);
      });
    });

    // Enter submenu buttons
    root.querySelectorAll("button[data-enter]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-enter"));
        const items = this._getCurrentLevelItems();
        this._enterSubmenu(items[idx]);
      });
    });

    // Editor inputs
    const propLabel = root.querySelector("#prop-label");
    if (propLabel) {
      propLabel.addEventListener("input", (e) => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          items[this._selectedItemIndex].label = e.target.value;
          this._drawCanvasPreview();
        }
      });
    }

    const propIcon = root.querySelector("#prop-icon");
    if (propIcon) {
      propIcon.addEventListener("change", (e) => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          items[this._selectedItemIndex].icon = e.target.value;
          this._drawCanvasPreview();
        }
      });
    }

    const propColor = root.querySelector("#prop-color");
    if (propColor) {
      propColor.addEventListener("input", (e) => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          items[this._selectedItemIndex].color = e.target.value;
          this._drawCanvasPreview();
        }
      });
    }

    const propEntity = root.querySelector("#prop-entity");
    if (propEntity) {
      propEntity.addEventListener("change", (e) => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          items[this._selectedItemIndex].entity_id = e.target.value;
        }
      });
    }

    const propPowerSensor = root.querySelector("#prop-power-sensor");
    if (propPowerSensor) {
      propPowerSensor.addEventListener("change", (e) => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          if (!items[this._selectedItemIndex].options) items[this._selectedItemIndex].options = {};
          items[this._selectedItemIndex].options.power_sensor = e.target.value;
        }
      });
    }

    const propPowerThresh = root.querySelector("#prop-power-threshold");
    if (propPowerThresh) {
      propPowerThresh.addEventListener("input", (e) => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          if (!items[this._selectedItemIndex].options) items[this._selectedItemIndex].options = {};
          items[this._selectedItemIndex].options.power_threshold = parseFloat(e.target.value) || 0;
        }
      });
    }

    // Info Screen sub-items
    root.querySelectorAll("input[data-info-field]").forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const iIdx = parseInt(inp.getAttribute("data-info-idx"));
        const fld = inp.getAttribute("data-info-field");
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          const itList = items[this._selectedItemIndex].options?.items;
          if (itList && itList[iIdx]) {
            itList[iIdx][fld] = e.target.value;
          }
        }
      });
    });

    const btnAddInfo = root.querySelector("#btn-add-info-item");
    if (btnAddInfo) {
      btnAddInfo.addEventListener("click", () => {
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          if (!items[this._selectedItemIndex].options) items[this._selectedItemIndex].options = {};
          if (!items[this._selectedItemIndex].options.items) items[this._selectedItemIndex].options.items = [];
          items[this._selectedItemIndex].options.items.push({
            label: "Verlauf",
            type: "chart",
            entity_id: "",
            time_range_hours: 24,
          });
          this._render();
        }
      });
    }

    root.querySelectorAll("button[data-del-info]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const iIdx = parseInt(btn.getAttribute("data-del-info"));
        const items = this._getCurrentLevelItems();
        if (this._selectedItemIndex !== null && items[this._selectedItemIndex]) {
          const itList = items[this._selectedItemIndex].options?.items;
          if (itList) {
            itList.splice(iIdx, 1);
            this._render();
          }
        }
      });
    });
  }

  _drawCanvasPreview() {
    const canvas = this.shadowRoot.querySelector("#display-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = 240;
    const height = 240;
    const cx = 120;
    const cy = 120;
    const items = this._getCurrentLevelItems();

    // Background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    if (items.length === 0) {
      ctx.fillStyle = "#475569";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Keine Elemente", cx, cy);
      return;
    }

    const selectedItem = this._selectedItemIndex !== null ? items[this._selectedItemIndex] : items[0];

    // Check if we are previewing an active screen or the radial menu
    if (selectedItem && selectedItem.type === "screen" && selectedItem.screen === "brightness") {
      // ── Brightness Preview ──
      const pct = 70;
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(cx, cy, 114, 0, 2 * Math.PI);
      ctx.fill();

      // Bottom fill
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 114, 0, 2 * Math.PI);
      ctx.clip();
      ctx.fillStyle = selectedItem.color || "#ffaa00";
      const fillHeight = 240 * (pct / 100);
      ctx.fillRect(0, 240 - fillHeight, 240, fillHeight);
      ctx.restore();

      ctx.fillStyle = pct > 55 ? "#000" : "#fff";
      ctx.font = "bold 44px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pct + "%", cx, cy);

      ctx.font = "13px -apple-system, sans-serif";
      ctx.fillText(selectedItem.label || "Licht", cx, cy + 45);

    } else if (selectedItem && selectedItem.type === "screen" && selectedItem.screen === "switch") {
      // ── Switch Preview ──
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 114, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 42px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AN", cx, cy - 10);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.fillText(selectedItem.label || "Schalter", cx, cy + 40);

    } else if (selectedItem && selectedItem.type === "screen" && selectedItem.screen === "info") {
      // ── Info Preview (Value / Gauge) ──
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 100, Math.PI * 0.7, Math.PI * 0.3, false);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 36px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("420", cx, cy - 10);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.fillText("WATT", cx, cy + 25);
      ctx.fillText(selectedItem.label || "Verbrauch", cx, cy + 50);

      // Dots on right
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 0 ? "#fff" : "#475569";
        ctx.beginPath();
        ctx.arc(205, 100 + i * 20, i === 0 ? 6 : 3.5, 0, 2 * Math.PI);
        ctx.fill();
      }

    } else {
      // ── Radial Menu Clock Layout ──
      const count = items.length;
      const angleStep = (36 * Math.PI) / 180;
      const totalArc = (count - 1) * angleStep;
      const startAngle = Math.PI / 2 + totalArc / 2;

      // Draw center label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(selectedItem ? selectedItem.label : "", cx, cy - 10);

      ctx.fillStyle = "#64748b";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(selectedItem ? (selectedItem.type === "submenu" ? "Untermenü" : selectedItem.screen) : "", cx, cy + 15);

      // Radial icons
      items.forEach((item, idx) => {
        const isSel = idx === this._selectedItemIndex;
        const radius = isSel ? 86 : 94;
        const angle = startAngle - idx * angleStep;
        const x = cx + radius * Math.cos(angle);
        const y = cy - radius * Math.sin(angle);

        // Icon circle bubble
        ctx.fillStyle = isSel ? (item.color || "#38bdf8") : "#1c222c";
        ctx.beginPath();
        ctx.arc(x, y, isSel ? 22 : 18, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = item.color || "#38bdf8";
        ctx.lineWidth = isSel ? 2.5 : 1;
        ctx.stroke();

        // Icon character
        ctx.fillStyle = isSel ? "#000" : "#fff";
        ctx.font = "14px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this._getIconChar(item.icon), x, y);
      });
    }

    // Outer display rim
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 118, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

customElements.define("smartknob-panel", SmartKnobPanel);
