const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("fs");
const https = require("https");
const { exec } = require("child_process");

let axios;
try {
  axios = require("axios");
} catch (e) {
  Log.error(
    "[MMM-Hue-Motion-Screensaver] Failed to load 'axios'. Run 'npm install' in the module directory.",
  );
}

module.exports = NodeHelper.create({
  currentScreenState: null, // Variable to store the current screen state
  moduleConfig: null, // Config received once via INIT_CONFIG
  httpsAgent: null, // Reusable HTTPS agent with Hue Bridge CA cert

  /**
   * Called when the node helper is started.
   */
  start: function () {
    this.log("Starting node helper for: " + this.name);
    const caCert = fs.readFileSync(__dirname + "/hue_bridge_ca_cert.pem");
    this.httpsAgent = new https.Agent({
      ca: caCert,
      rejectUnauthorized: true,
    });
  },

  /**
   * Handles received socket notifications.
   * @param {string} notification - The notification type.
   * @param {any} payload - The payload of the notification.
   */
  socketNotificationReceived: function (notification, payload) {
    if (notification === "INIT_CONFIG") {
      this.moduleConfig = payload;
    } else if (notification === "CHECK_MOTION") {
      this.checkMotion();
    } else if (notification === "TOGGLE_SCREEN") {
      this.toggleScreen(payload);
    }
  },

  /**
   * Checks the motion state from the Hue sensor using the cached module config.
   */
  checkMotion: async function () {
    if (!axios) {
      this.logError(
        "axios is not available. Run 'npm install' in the module directory.",
      );
      return;
    }

    if (!this.moduleConfig) {
      this.logError("checkMotion called before INIT_CONFIG was received");
      return;
    }

    const { hueHost, sensorId, apiKey } = this.moduleConfig;

    if (
      !hueHost ||
      typeof hueHost !== "string" ||
      !sensorId ||
      typeof sensorId !== "string" ||
      !apiKey ||
      typeof apiKey !== "string"
    ) {
      this.logError(
        "Invalid config: hueHost, sensorId, and apiKey must be non-empty strings",
      );
      return;
    }

    const pirUrl = `https://${hueHost}/clip/v2/resource/motion/${sensorId}`;
    const headers = {
      "hue-application-key": apiKey,
    };

    try {
      const response = await axios.get(pirUrl, {
        headers: headers,
        httpsAgent: this.httpsAgent,
      });

      const data = response.data;
      const motion = data?.data?.[0]?.motion?.motion_report?.motion || false;
      this.sendSocketNotification("MOTION_RESULT", motion);
    } catch (error) {
      this.logError(
        `Error fetching motion state: ${error.message} (status: ${error.response?.status ?? "N/A"})`,
      );
      this.sendSocketNotification("MOTION_RESULT", true);
    }
  },

  /**
   * Toggles the screen on or off using commands from the cached module config.
   * Note: screenCommandOn/Off are user-configured shell commands from config.js.
   * They are treated as trusted static configuration, not as external input.
   * @param {boolean} on - Whether to turn the screen on.
   */
  toggleScreen: function (on) {
    if (!this.moduleConfig) {
      this.logError("toggleScreen called before INIT_CONFIG was received");
      return;
    }

    const command = on
      ? this.moduleConfig.screenCommandOn
      : this.moduleConfig.screenCommandOff;

    exec(command, { timeout: 5000 }, (error, _stdout, stderr) => {
      if (error) {
        this.logError(
          `Error toggling screen (exit code ${error.code}): ${error.message}${stderr ? " — stderr: " + stderr.trim() : ""}`,
        );
      } else {
        const newStatus = on ? "on" : "off";
        if (this.currentScreenState !== newStatus) {
          this.log(`Screen toggled ${newStatus}`);
          this.currentScreenState = newStatus;
        }
      }
    });
  },

  /**
   * Logs an informational message.
   * @param {string} message - The message to log.
   */
  log: function (message) {
    Log.info(`[${this.name}] ${message}`);
  },

  /**
   * Logs an error message.
   * @param {string} message - The message to log.
   * @param {Error} [error] - Optional error object.
   */
  logError: function (message, error) {
    if (error) {
      Log.error(`[${this.name}] ${message}`, error);
    } else {
      Log.error(`[${this.name}] ${message}`);
    }
  },
});
