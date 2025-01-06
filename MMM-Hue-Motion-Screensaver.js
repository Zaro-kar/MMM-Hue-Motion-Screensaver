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
      this.lastAction = new Date();
      this.state = -1;
      this.nextScreenOffTime = null; // Zeitpunkt, wann der Bildschirm ausgeschaltet wird
      this.scheduleUpdate();
  },

  scheduleUpdate: function () {
      setInterval(() => {
          this.checkMotion();
      }, this.config.pollInterval);
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
          this.nextScreenOffTime = new Date(
              now.getTime() + this.config.coolDown * 1000
          );
          if (this.state !== 1) {
              this.state = 1;
              this.toggleScreen(true);
          }
      } else if (
          !motion &&
          (now - this.lastAction) > this.config.coolDown * 1000
      ) {
          if (isWithinTimeRange) {
              Log.info("SCREEN OFF command ignored due to time range");
          } else {
              this.state = 0;
              this.toggleScreen(false);
              this.nextScreenOffTime = null;
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

  getDom: function () {
      const wrapper = document.createElement("div");
      if (this.nextScreenOffTime) {
          const timeString = this.nextScreenOffTime.toLocaleTimeString();
          wrapper.innerHTML = `Next screen off: ${timeString}`;
      } else {
          wrapper.innerHTML = "Screen is active";
      }
      return wrapper;
  }
});
