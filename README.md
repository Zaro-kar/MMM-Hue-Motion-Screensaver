# MMM-Hue-Motion-Screensaver

The MMM-Hue-Motion-Screensaver module allows you to automatically control the screen of your [MagicMirror²][mm] based on motion detected by a Philips Hue motion sensor.

With this module, you can ensure that your [MagicMirror²][mm] is only active when someone is nearby, providing a seamless and intelligent user experience, as well as saving energy and extending the life of your screen. It is easy to integrate into your existing MagicMirror² setup.

## Examples

| Screenshot | Description |
|------------|-------------|
| ![Screenshot 0](./screenshots/screenshot_0.png) | *Display when the timer is active and the screen is about to turn off.* |
| ![Screenshot 1](./screenshots/screenshot_1.png) | *Display when motion is detected.* |
| ![Screenshot 2](./screenshots/screenshot_2.png) | *Display when `activeDays`, `startTime`, and `endTime` are configured, and the screen stays on between the specified times on those days.* |
| ![Screenshot 3](./screenshots/screenshot_3.png) | *Display right after MagicMirror starts, when no motion has been detected yet.* |

## Installation

### Install

In your terminal, go to your [MagicMirror²][mm] Module folder and clone MMM-Hue-Motion-Screensaver:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/Zaro-kar/MMM-Hue-Motion-Screensaver.git
cd MMM-Hue-Motion-Screensaver
npm install
```

> **Note:** The `npm install` step is required to install the `axios` dependency used by the node helper. Without it, the module will silently fail to load.

### Update

```bash
cd ~/MagicMirror/modules/MMM-Hue-Motion-Screensaver
git pull
```

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:

```js
{
    module: 'MMM-Hue-Motion-Screensaver',
    position: 'lower_third',
    config: {
        hueBridgeID: 'your-hue-bridge-id', // Required
        sensorId: 'your-sensor-id', // Required
        apiKey: 'your-api-key', // Required
    }
}
```

## Configuration options

Option|Possible values|Default|Description
------|------|------|-----------
`hueBridgeID`|`string`|N/A|**Required**. The ID of your Hue Bridge (e.g., "beb7cfcccd56ab3a")
`sensorId`|`string`|N/A|**Required**. The ID of the motion sensor (e.g., "1")
`apiKey`|`string`|N/A|**Required**. The API key for the Hue Bridge (e.g., "your-api-key")
`coolDown`|`number`|300|The cooldown time in seconds before the screen turns off (e.g., 300)
`activeDays`|`array`|["Sat", "Sun"]|The days on which the module is always on (e.g., ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]). **Note:** The `startTime` and `endTime` settings are only effective on these days.
`startTime`|`string`|"06:00"|The start time in "HH:MM" format (e.g., "06:00"). **Note:** This works only in conjunction with `activeDays`. The monitor will stay on between `startTime` and `endTime` only on the days defined in `activeDays`.
`endTime`|`string`|"22:00"|The end time in "HH:MM" format (e.g., "22:00"). **Note:** This works only in conjunction with `activeDays`. The monitor will stay on between `startTime` and `endTime` only on the days defined in `activeDays`.
`pollInterval`|`number`|2000|The polling interval in milliseconds (e.g., 2000)
`language`|`string`|"en"|The language for the display (available options: "en", "de")
`screenCommandOn`|`string`|"xrandr -display :0.0 --output HDMI-1 --auto"|The command to turn the screen on. You can also specify additional options like `--rotate left`, `--brightness 0.7`, etc.
`screenCommandOff`|`string`|"xrandr -display :0.0 --output HDMI-1 --off"|The command to turn the screen off. You can also specify additional options like `--rotate left`, `--brightness 0.7`, etc.

**Note:** This module has been tested with `xrandr` and works by default with it. While you can theoretically provide a command for another driver like Wayland, functionality with other drivers is not guaranteed.

## Obtain the Values for the required parameter

[Official 'Getting Started' guide from Philips Hue](https://developers.meethue.com/develop/hue-api-v2/getting-started/)

### Obtaining the Hue Bridge ID

To find the ID of your Hue Bridge, you can use the following command:

```bash
openssl s_client -showcerts -connect <Bridge-IP-Address>:443
```

The output will include a line like this:

```
# I've replaced the actual ID with 'HUE_BRIDGE_ID'
subject=/C=NL/O=Philips Hue/CN=<HUE_BRIDGE_ID>
issuer=/C=NL/O=Philips Hue/CN=<HUE_BRIDGE_ID>
```

### Add the Bridge ID as host to /etc/hosts

In order to use https for the requests to the Hue Bridge, you have to add the `hueBridgeID` along with the IP address of the Hue Bridge to the `/etc/hosts` file:

```bash
sudo nano /etc/hosts
```

Add the following line:

```
<Bridge-IP-Address>     <hueBridgeID>
```

### Generating an API key

To generate an API key for your Hue Bridge, follow these steps:
1. Press the link button on your Hue Bridge.
2. Within 30 seconds, send a POST request to the Hue Bridge using a tool like `curl`:
   ```bash
   curl -X POST -d '{"devicetype":"my_hue_app"}' http://<hue-bridge-ip>/api
   ```
3. The response will contain a username, which is your API key.

### Finding the sensor ID

To find the ID of your Hue motion sensor, you can use the Hue API. Open a web browser and go to `https://<bridge-ip-address>/clip/v2/resource/device`. Make sure you are on the same network as the bridge and use the IP address obtained earlier. Look for the sensor with the type "ZLLPresence" and note its ID.

### Hue Bridge CA Certificate

The `hue_bridge_ca_cert.pem` file included in this project is the public CA certificate for the Hue Bridge. It is used to establish a secure HTTPS connection with the Hue Bridge. You can find this certificate on the official Philips Hue developer website: [Using HTTPS](https://developers.meethue.com/develop/application-design-guidance/using-https/).

## Server-only + client-only setup (e.g. LXC + Raspberry Pi)

If MagicMirror² runs as a **server only** (e.g. in an LXC container or on a separate machine) and the display is on a separate **client device** (e.g. a Raspberry Pi running only the browser), the screen commands in `node_helper.js` execute on the server — where no display is connected.

The solution is to run the screen commands remotely via SSH from the server to the client device.

> **Why not `xrandr --off`, `xset dpms`, or `vcgencmd display_power`?**
> - `xrandr --output HDMI-1 --off` shuts the output off, but the X server or Chromium re-enables it automatically within seconds.
> - `xset dpms force off` puts the monitor into standby, but DOM updates from MagicMirror modules (clock, weather, etc.) wake it up again immediately.
> - `vcgencmd display_power` no longer works reliably on newer Raspberry Pi OS versions that use the KMS driver (default since 2024).
>
> The recommended solution is **`ddcutil`**, which controls the monitor directly over the DDC/CI protocol (I²C) — independent of X, DPMS, or Chromium. The monitor actually powers off (not just standby).

### 1. Set up `ddcutil` on the Raspberry Pi

```bash
sudo apt install -y ddcutil

# Load the I²C kernel module and persist it across reboots
sudo modprobe i2c-dev
echo "i2c-dev" | sudo tee /etc/modules-load.d/i2c-dev.conf

# Optional: allow ddcutil without sudo
sudo usermod -aG i2c <YOUR-USERNAME>
```

Log out and back in after adding yourself to the `i2c` group.

Test locally on the Pi:

```bash
ddcutil setvcp d6 4   # monitor off
ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left   # monitor on
```

> The `sleep 2` after powering on is necessary — the monitor needs a moment to accept the HDMI signal again. Without it the screen stays black even though the monitor is on.

### 2. Set up passwordless SSH from the server to the Pi

On the **server** (as the user running MagicMirror):

```bash
# Generate a key without a passphrase
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

# Copy the key to the Pi
ssh-copy-id <YOUR-USERNAME>@<PI-IP>

# Test
ssh <YOUR-USERNAME>@<PI-IP> 'echo "SSH works"'
```

> **Important:** The key must have **no passphrase**, otherwise the non-interactive `exec()` call in `node_helper.js` will fail silently.

### 3. Update screenCommandOn / screenCommandOff in config.js

```js
{
    module: 'MMM-Hue-Motion-Screensaver',
    position: 'lower_third',
    config: {
        hueBridgeID: 'your-hue-bridge-id',
        sensorId: 'your-sensor-id',
        apiKey: 'your-api-key',
        screenCommandOff: "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 <YOUR-USERNAME>@<PI-IP> 'ddcutil setvcp d6 4'",
        screenCommandOn:  "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 <YOUR-USERNAME>@<PI-IP> 'ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left'",
    }
}
```

If your monitor is in **landscape orientation**, remove `--rotate left` from `screenCommandOn`.

| SSH flag | Purpose |
|----------|---------|
| `-o StrictHostKeyChecking=no` | Suppresses the interactive "Are you sure...?" prompt on first connect |
| `-o ConnectTimeout=5` | Aborts after 5 seconds if the Pi is unreachable, preventing MagicMirror from hanging |

---

## Raspberry Pi 3 kiosk client setup guide

For a complete guide on setting up a Raspberry Pi 3 as a minimal, stable 24/7 kiosk client (Raspberry Pi OS Lite + X + Chromium, no desktop environment), including:

- Minimal OS install and system tuning
- GPU memory, swap, and boot configuration
- Disabling unnecessary services
- Chromium kiosk script with all relevant flags explained
- Autostart via `.bash_profile` or systemd service
- Hardware watchdog + Chromium watchdog cronjob
- Screen on/off schedule with `ddcutil`
- Full troubleshooting reference

→ See **[docs/raspi3-kiosk-setup.md](docs/raspi3-kiosk-setup.md)**

---

## Sending notifications to the module

Notification|Description
------|-----------
`CHECK_MOTION`|Checks the motion status of the sensor
`TOGGLE_SCREEN`|Toggles the screen on or off

## Developer commands

- `npm install` - Install devDependencies like ESLint.
- `npm run lint` - Run linting and formatter checks.
- `npm run lint:fix` - Fix linting and formatter issues.

[mm]: https://github.com/MagicMirrorOrg/MagicMirror