/**
 * Module: MMM-Hue-Motion-Screensaver
 * Description: Controls the MagicMirror screen based on motion detected via a Hue Motion Sensor.
 */

Module.register("MMM-Hue-Motion-Screensaver", {
  defaults: {
      hueHost: "", // Hostname oder IP-Adresse der Hue Bridge
      sensorId: "", // Sensor-ID
      apiKey: "", // API-Schlüssel
      coolDown: 5 * 60, // Cooldown in Sekunden
      startTime: "06:00",
      endTime: "00:00",
      pollInterval: 2000 // Intervall zur Abfrage des Sensors in ms
  },

  start: function () {
      this.log("Starting module: " + this.name);
      this.lastAction = new Date();
      this.state = -1;
      this.remainingTime = null; // Zeit bis zum Ausschalten in Sekunden
      this.scheduleUpdate();
  },

  scheduleUpdate: function () {
      setInterval(() => {
          this.checkMotion();
      }, this.config.pollInterval);

      setInterval(() => {
          this.updateRemainingTime();
      }, 1000); // Update jede Sekunde
  },

  checkMotion: function () {
      const pirUrl = `https://${this.config.hueHost}/clip/v2/resource/motion/${this.config.sensorId}`;
      const headers = {
          "hue-application-key": this.config.apiKey
      };

      this.sendSocketNotification("CHECK_MOTION", {
          pirUrl,
          headers,
          certPath: "/home/zaro/Pir/hue_bridge_cert.pem"
      });
  },

  socketNotificationReceived: function (notification, payload) {
      if (notification === "MOTION_RESULT") {
          this.handleMotionResult(payload);
      }
  },

  handleMotionResult: function (motion) {
      const now = new Date();
      const isWithinTimeRange = this.isWithinTimeRange(
          this.config.startTime,
          this.config.endTime
      );

      if (motion) {
          this.lastAction = now;
          this.remainingTime = this.config.coolDown;
          if (this.state !== 1) {
              this.state = 1;
              this.toggleScreen(true);
          }
      } else if (
          !motion &&
          (now - this.lastAction) > this.config.coolDown * 1000
      ) {
          if (isWithinTimeRange) {
              this.log("SCREEN OFF command ignored due to time range");
          } else {
              this.state = 0;
              this.toggleScreen(false);
              this.remainingTime = null;
          }
      }

      this.updateDom(); // Aktualisiere die Anzeige
  },

  toggleScreen: function (on) {
      this.sendSocketNotification("TOGGLE_SCREEN", on);
  },

  isWithinTimeRange: function (startTime, endTime) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const [startHour, startMinute] = startTime.split(":".map(Number));
      const [endHour, endMinute] = endTime.split(":".map(Number));

      const start = startHour * 60 + startMinute;
      const end = endHour * 60 + endMinute;

      if (start <= end) {
          return currentTime >= start && currentTime <= end;
      } else {
          return currentTime >= start || currentTime <= end;
      }
  },

  updateRemainingTime: function () {
      if (this.remainingTime !== null && this.remainingTime > 0) {
          this.remainingTime -= 1;
      } else {
          this.remainingTime = null;
      }
      this.updateDom();
  },

  getDom: function () {
      const wrapper = document.createElement("div");
      if (this.remainingTime !== null) {
          wrapper.innerHTML = `Screen off in: ${this.remainingTime} seconds`;
      } else {
          wrapper.innerHTML = "Screen is active";
      }
      return wrapper;
  },

  log: function (message) {
      Log.info(`[${this.name}] ${message}`);
  },

  logError: function (message, error) {
      Log.error(`[${this.name}] ${message}`, error);
  }
});
