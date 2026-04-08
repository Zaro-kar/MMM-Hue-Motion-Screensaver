# Raspberry Pi 3 as MagicMirror Kiosk Client

Goal: Set up the Raspberry Pi 3 with a minimal OS as a pure browser kiosk that displays the MagicMirror web interface from the LXC server — stable, resource-efficient, and suitable for 24/7 continuous operation.

---

## 1. Install Raspberry Pi OS Lite

### 1.1 Download and flash the image

1. Download **Raspberry Pi OS Lite (64-bit or 32-bit)** — the version **without a desktop**.
   - Download: https://www.raspberrypi.com/software/operating-systems/
   - Alternatively: use the Raspberry Pi Imager.
2. Flash the image to the SD card (e.g. with Raspberry Pi Imager or balenaEtcher).
3. **In Raspberry Pi Imager** (recommended): configure SSH access, Wi-Fi, and username/password directly under "Advanced Options" before flashing.

### 1.2 First boot and basic configuration

Connect via SSH (default: `ssh pi@raspberrypi.local`) and apply the basic settings:

```bash
sudo raspi-config
```

Relevant settings:

- **System Options → Hostname**: Choose a meaningful name, e.g. `magicmirror-kiosk`
- **Localisation Options → Locale**: Set your locale, e.g. `en_GB.UTF-8`
- **Localisation Options → Timezone**: Set your timezone, e.g. `Europe/London`
- **Interface Options → SSH**: Keep enabled
- **Advanced Options → Expand Filesystem**: Use the full SD card

Then reboot:

```bash
sudo reboot
```

---

## 2. Update and clean up the system

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt autoremove -y
sudo apt clean
```

---

## 3. Adjust GPU memory and boot configuration

Edit `/boot/firmware/config.txt` (on older images: `/boot/config.txt`):

```bash
sudo nano /boot/firmware/config.txt
```

Add or adjust the following lines:

```ini
# Increase GPU memory (important for Chromium rendering)
gpu_mem=128

# Force HDMI output (prevents issues with monitors lacking EDID)
hdmi_force_hotplug=1

# Disable screensaver / blanking
avoid_warnings=1

# Overclocking (optional, moderate and safe for Pi 3)
# arm_freq=1300
# over_voltage=2
# gpu_freq=500
```

> **Note:** Overclocking is optional. Test whether the Pi runs stably with it. If instability occurs, comment the lines out again.

---

## 4. Increase swap space

The Pi 3 has only 1 GB of RAM. More swap helps prevent out-of-memory crashes.

### Option A: Using `dphys-swapfile`

`dphys-swapfile` is not always pre-installed on Raspberry Pi OS Lite. Install it if needed:

```bash
sudo apt install -y dphys-swapfile
```

Then configure it:

```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
```

Change to:

```
CONF_SWAPSIZE=512
```

Enable it:

```bash
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Option B: Manually (without `dphys-swapfile`)

```bash
sudo swapoff -a
sudo fallocate -l 512M /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

To persist the swap across reboots:

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Verify

```bash
free -h
```

---

## 5. Disable unnecessary services

Turn off everything a pure kiosk doesn't need:

```bash
# Disable Bluetooth
sudo systemctl disable bluetooth
sudo systemctl disable hciuart

# Avahi/mDNS (optional, only disable if .local access is not needed)
# sudo systemctl disable avahi-daemon

# Triggerhappy (hotkey daemon)
sudo systemctl disable triggerhappy

# Man-DB update (saves boot time)
sudo systemctl disable man-db.timer
```

Also disable Bluetooth in the boot config (`/boot/firmware/config.txt`):

```ini
dtoverlay=disable-bt
```

---

## 6. Install a minimal X server environment

Instead of a full desktop, install only the bare minimum needed to run a browser:

```bash
sudo apt install -y --no-install-recommends \
    xserver-xorg \
    xserver-xorg-legacy \
    x11-xserver-utils \
    xinit \
    chromium \
    unclutter
```

**What gets installed:**

- `xserver-xorg`: Minimal X server (no desktop, no window manager)
- `xserver-xorg-legacy`: Allows X to start as a regular user via systemd (without this, the kiosk service fails with `Permission denied` on `/dev/tty0`)
- `x11-xserver-utils`: Provides `xset` and `xrandr` (disable screensaver, display control)
- `xinit`: Starts X without a display manager
- `chromium`: The kiosk browser (called `chromium` on newer Raspberry Pi OS versions, not `chromium-browser`)
- `unclutter`: Hides the mouse cursor after inactivity

### Configure X server permissions

To allow the X server to start via a systemd service (as a regular user):

```bash
sudo nano /etc/X11/Xwrapper.config
```

Content:

```
allowed_users=anybody
needs_root_rights=yes
```

---

## 7. Create the kiosk startup script

Create the startup script that launches X + Chromium in kiosk mode:

```bash
nano ~/kiosk.sh
```

Content:

```bash
#!/bin/bash

# === CONFIGURATION ===
# Adjust the URL to your MagicMirror server:
MAGICMIRROR_URL="http://<LXC-CONTAINER-IP>:8080"

# === CLEAN UP OLD PROCESSES ===
# Prevents duplicate Chromium start on service restart
pkill -x chromium 2>/dev/null
sleep 1

# === DISABLE SCREENSAVER ===
xset s off          # Disable screensaver timer
xset s noblank      # No blanking
xset -dpms          # Disable DPMS (screen control is handled via ddcutil)

# === ROTATE SCREEN (optional) ===
# If the monitor is mounted portrait: use "left" or "right" depending on orientation.
# For landscape: comment out or remove this line.
xrandr --output HDMI-1 --rotate left

# === HIDE MOUSE CURSOR ===
unclutter -idle 0.5 -root &

# === CLEAN UP OLD CHROMIUM PROFILE ===
# Prevents "Chromium did not shut down correctly" messages
CHROMIUM_DIR="$HOME/.config/chromium"
if [ -d "$CHROMIUM_DIR/Default" ]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' \
        "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' \
        "$CHROMIUM_DIR/Default/Preferences" 2>/dev/null
fi

# === START CHROMIUM IN KIOSK MODE ===
# Note: On newer Pi OS versions the command is "chromium" (not "chromium-browser").
# Adjust --window-size to the (rotated) resolution (width x height after rotation).
# Example: 1920x1200 monitor in portrait (--rotate left) → 1200x1920.
# Without rotation at 1920x1080: --window-size=1920,1080
chromium \
    --kiosk \
    --start-fullscreen \
    --noerrdialogs \
    --disable-infobars \
    --disable-translate \
    --disable-features=TranslateUI \
    --disable-suggestions-ui \
    --disable-save-password-bubble \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --disable-background-networking \
    --disable-sync \
    --disable-default-apps \
    --disable-extensions \
    --disable-gpu \
    --disable-gpu-sandbox \
    --disable-gpu-compositing \
    --disable-software-rasterizer \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --memory-pressure-off \
    --process-per-site \
    --window-position=0,0 \
    --window-size=1200,1920 \
    "$MAGICMIRROR_URL"
```

Make it executable:

```bash
chmod +x ~/kiosk.sh
```

### Key Chromium flags explained

| Flag | Purpose |
|------|---------|
| `--kiosk` | Fullscreen, no UI |
| `--start-fullscreen` | Fallback for `--kiosk` (some Chromium versions need both) |
| `--disable-gpu` | Forces software rendering (Pi 3 has no GLES3) |
| `--disable-gpu-sandbox` | Prevents GPU sandbox errors in software mode |
| `--disable-gpu-compositing` | Prevents GPU crashes on the Pi 3 |
| `--disable-software-rasterizer` | Saves CPU when GPU support is missing |
| `--disable-dev-shm-usage` | Uses /tmp instead of /dev/shm (helps with low RAM) |
| `--memory-pressure-off` | Suppresses memory pressure warnings |
| `--process-per-site` | Fewer processes = less RAM |
| `--window-size=W,H` | Set window size to match the (rotated) resolution |

---

## 8. Configure autostart

### Option A: Via .bash_profile (simplest method)

Append to `~/.bash_profile`:

```bash
nano ~/.bash_profile
```

Add at the end:

```bash
# Auto-start kiosk mode (only on tty1, not over SSH)
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    xinit ~/kiosk.sh -- :0 -nocursor 2>/dev/null
fi
```

Also enable auto-login on tty1:

```bash
sudo raspi-config
```

→ **System Options → Boot / Auto Login → Console Autologin**

### Option B: Via systemd service (more robust)

```bash
sudo nano /etc/systemd/system/kiosk.service
```

Content (⚠️ replace `<YOUR-USERNAME>` and paths with your actual username!):

```ini
[Unit]
Description=MagicMirror Kiosk
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<YOUR-USERNAME>
Environment=DISPLAY=:0
ExecStart=/usr/bin/xinit /home/<YOUR-USERNAME>/kiosk.sh -- :0 -nocursor
Restart=on-failure
RestartSec=10

[Install]
WantedBy=graphical.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable kiosk.service
sudo systemctl start kiosk.service
```

---

## 9. Fully disable screen blanking

In addition to the `xset` commands in the kiosk script, also disable blanking at the kernel level:

```bash
sudo nano /boot/firmware/cmdline.txt
```

Append to the **end of the existing line** (everything must stay on one line!):

```
consoleblank=0
```

---

## 10. Automatic restart on failure (watchdog)

### 10.1 Enable the hardware watchdog

The Pi 3 has a built-in hardware watchdog. In `/boot/firmware/config.txt`:

```ini
dtparam=watchdog=on
```

Install and configure the watchdog daemon:

```bash
sudo apt install -y watchdog
sudo nano /etc/watchdog.conf
```

Uncomment the following lines:

```ini
watchdog-device = /dev/watchdog
max-load-1 = 24
watchdog-timeout = 15
```

Enable the service:

```bash
sudo systemctl enable watchdog
sudo systemctl start watchdog
```

### 10.2 Chromium watchdog via cron

If Chromium crashes, restart it automatically. Create a monitoring script:

```bash
nano ~/check_kiosk.sh
```

Content:

```bash
#!/bin/bash
if ! pgrep -f "chromium" > /dev/null; then
    echo "$(date): Chromium not found, restarting..." >> /home/<YOUR-USERNAME>/kiosk-watchdog.log
    sudo systemctl restart kiosk.service
fi
```

> **Note:** `pgrep -f` is used (not `pgrep -x`) because the Chromium process runs as `/usr/lib/chromium/chromium` and `pgrep -x` may not match the full path depending on the system. The log is written to the home directory since `/var/log` is not writable without root.

```bash
chmod +x ~/check_kiosk.sh
```

Check every 2 minutes via cron:

```bash
crontab -e
```

Add (adjust path to your username):

```
*/2 * * * * /home/<YOUR-USERNAME>/check_kiosk.sh
```

### 10.3 Daily reboot (optional)

If the Pi becomes unstable after several days, schedule a daily reboot at e.g. 4 AM:

```bash
sudo crontab -e
```

Add:

```
0 4 * * * /sbin/reboot
```

---

## 11. Schedule screen on/off (optional)

If you don't want the screen on at night:

```bash
nano ~/screen_control.sh
```

Content:

```bash
#!/bin/bash
case "$1" in
    off)
        ddcutil setvcp d6 4
        ;;
    on)
        ddcutil setvcp d6 1
        sleep 2
        DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left
        ;;
esac
```

```bash
chmod +x ~/screen_control.sh
```

Schedule via cron:

```bash
crontab -e
```

Add:

```
# Screen off at 23:00, on at 06:00
0 23 * * * /home/<YOUR-USERNAME>/screen_control.sh off
0 6  * * * /home/<YOUR-USERNAME>/screen_control.sh on
```

---

## 12. MMM-Hue-Motion-Screensaver: screen control via SSH + `ddcutil`

Since MagicMirror runs in server-only mode on the LXC container, `node_helper.js` of the MMM-Hue-Motion-Screensaver module also runs there — not on the Pi. The default `xrandr` commands have no effect because the LXC container has no access to the Pi's display.

The solution: SSH from the LXC container to the Pi and use `ddcutil` there. `ddcutil` controls the monitor directly over the DDC/CI protocol (I²C) — completely independent of X, DPMS, or Chromium. The monitor actually powers off (not just standby), saving energy and reducing wear.

> **Why not `xrandr --off`, `xset dpms`, or `vcgencmd display_power`?**
> - `xrandr --output HDMI-1 --off` shuts off the output, but the X server or Chromium re-enables it automatically within seconds.
> - `xset dpms force off` puts the monitor into standby, but DOM updates from MagicMirror modules (clock, weather, etc.) wake it back up immediately.
> - `vcgencmd display_power` no longer works reliably on newer Raspberry Pi OS versions using the KMS driver (default since 2024).
> - `ddcutil` bypasses all of these issues by addressing the monitor at the hardware level.

### 12.1 Install and configure `ddcutil` on the Pi

On the **Pi**:

```bash
sudo apt install -y ddcutil
```

Load the I²C kernel module and persist it across reboots:

```bash
sudo modprobe i2c-dev
echo "i2c-dev" | sudo tee /etc/modules-load.d/i2c-dev.conf
```

Optional: add your user to the `i2c` group (if `ddcutil` fails without `sudo`):

```bash
sudo usermod -aG i2c <YOUR-USERNAME>
```

Log out and back in afterwards.

Test locally on the Pi:

```bash
# Monitor off (actually powers off)
ddcutil setvcp d6 4

# Monitor on + rebuild HDMI signal (with rotation)
ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left
```

> **Note:** The `sleep 2` after powering on is necessary — the monitor needs a moment after waking up before it accepts the HDMI signal again. Without the pause the screen stays black even though the monitor is on.

### 12.2 Create an SSH key on the LXC container

On the **LXC container** (where MagicMirror runs as a server):

```bash
# Generate a new SSH key (no passphrase)
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519

# Copy the key to the Pi (adjust username!)
ssh-copy-id <YOUR-USERNAME>@<PI-IP>
```

Test that passwordless access works:

```bash
ssh <YOUR-USERNAME>@<PI-IP> 'echo "SSH works"'
```

### 12.3 Test remote screen control

On the **LXC container**:

```bash
# Turn screen off
ssh <YOUR-USERNAME>@<PI-IP> 'ddcutil setvcp d6 4'

# Turn screen on (with pause and rotation)
ssh <YOUR-USERNAME>@<PI-IP> 'ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left'
```

### 12.4 Update MagicMirror config

In MagicMirror's `config/config.js` on the **LXC container**, update the module's screen commands:

```js
{
    module: 'MMM-Hue-Motion-Screensaver',
    position: 'lower_third',
    config: {
        hueBridgeID: 'your-hue-bridge-id',
        sensorId: 'your-sensor-id',
        apiKey: 'your-api-key',
        screenCommandOff: "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 <YOUR-USERNAME>@<PI-IP> 'ddcutil setvcp d6 4'",
        screenCommandOn: "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 <YOUR-USERNAME>@<PI-IP> 'ddcutil setvcp d6 1 && sleep 2 && DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left'",
        // ... other options like coolDown, activeDays, etc.
    }
}
```

If your monitor is in **landscape orientation**, remove `--rotate left` from `screenCommandOn`.

**SSH flag reference:**

| Flag | Purpose |
|------|---------|
| `-o StrictHostKeyChecking=no` | Suppresses the interactive "Are you sure...?" prompt on first connect |
| `-o ConnectTimeout=5` | Aborts after 5 seconds if the Pi is unreachable, preventing MagicMirror from hanging |

### 12.5 Note: screen schedule

If you also use the screen schedule from section 11, the `screen_control.sh` script there has also been updated to use `ddcutil`.

---

## 13. Final verification

After a reboot (`sudo reboot`) verify:

```bash
# Check RAM usage (idle should be under 200 MB)
free -h

# Check running processes (should be minimal)
ps aux | wc -l

# Check CPU temperature
vcgencmd measure_temp

# Is Chromium running?
pgrep -a chromium

# Swap usage
swapon --show
```

### Expected values (idle)

| Measurement | Expected |
|-------------|----------|
| RAM usage (without Chromium) | ~80–120 MB |
| RAM usage (with Chromium + MagicMirror) | ~300–500 MB |
| CPU temperature | 45–55 °C |
| Number of running processes | ~40–60 |

---

## Summary of optimizations

| Measure | Effect |
|---------|--------|
| Raspberry Pi OS Lite instead of Desktop | ~300 MB RAM saved |
| No window manager | ~50 MB RAM saved |
| GPU memory set to 128 MB | Better Chromium rendering |
| Swap increased to 512 MB | Buffer for memory pressure |
| Bluetooth / unused services disabled | Less CPU/RAM in background |
| Chromium flags optimized | Less RAM, fewer crashes |
| Hardware watchdog | Automatic reboot on freeze |
| Chromium watchdog | Automatic restart on crash |
| Screensaver disabled | No unexpected blank screen |
| Hue module via SSH + ddcutil | Monitor controlled directly via DDC/CI (true off, not just standby) |

---

## Troubleshooting

**X server won't start – `Cannot open /dev/tty0 (Permission denied)`:**
- `xserver-xorg-legacy` must be installed: `sudo apt install -y xserver-xorg-legacy`
- `/etc/X11/Xwrapper.config` must contain `allowed_users=anybody` and `needs_root_rights=yes`
- User must be in the `tty` group: `sudo usermod -aG tty <YOUR-USERNAME>`

**Chromium shows "Aw, Snap!" error:**
- RAM problem. Check `free -h`. If swap is full: increase swap or reduce MagicMirror modules.

**Chromium window doesn't fill the screen:**
- Check `--window-size=` in the kiosk script. Must match the (rotated!) resolution.
- Check current resolution: `DISPLAY=:0 xrandr`
- Both `--kiosk` and `--start-fullscreen` should be set.

**Screen stays black after boot:**
- Check `hdmi_force_hotplug=1` in config.txt.
- Use SSH and try `DISPLAY=:0 xrandr --output HDMI-1 --auto`.

**`vcgencmd display_power` is ignored:**
- On newer Pi OS versions with the KMS driver, `vcgencmd display_power` no longer works. Use `ddcutil` instead (see section 12).

**`xrandr --output HDMI-1 --off` only turns the screen off briefly:**
- The X server or Chromium re-enables the output automatically within seconds. Use `ddcutil` instead.

**`xset dpms force off` – screen comes back on after a few seconds:**
- DOM updates from MagicMirror modules (clock, weather, etc.) wake the screen via DPMS. Use `ddcutil` instead — it controls the monitor at the hardware level, independent of X/DPMS.

**`ddcutil setvcp d6 4` – `No /dev/i2c devices exist`:**
- Load the I²C module: `sudo modprobe i2c-dev`
- For autostart: `echo "i2c-dev" | sudo tee /etc/modules-load.d/i2c-dev.conf`
- Optionally add user to `i2c` group: `sudo usermod -aG i2c <YOUR-USERNAME>`

**`ddcutil setvcp d6 1` – monitor turns on but screen stays black:**
- The monitor needs a moment after waking up before it accepts the HDMI signal. Add `sleep 2` after `ddcutil setvcp d6 1`, then run `DISPLAY=:0 xrandr --output HDMI-1 --auto --rotate left` (see section 12).

**Chromium starts twice on `systemctl restart kiosk.service`:**
- The cleanup step is missing from the kiosk script. Add `pkill -x chromium 2>/dev/null && sleep 1` at the top (see section 7).

**`Undervoltage detected!` on boot:**
- The power supply is not delivering enough current. Use a 5V / 2.5A (preferably 3A) power supply and a quality Micro-USB cable. Without stable power the Pi can hang under load.

**`chromium-browser: command not found`:**
- On newer Raspberry Pi OS versions the command is `chromium` instead of `chromium-browser`. Check with `which chromium`.

**`dphys-swapfile: command not found`:**
- Not pre-installed on Pi OS Lite. Either install with `sudo apt install -y dphys-swapfile` or set up swap manually (see section 4).

**Chromium doesn't start automatically:**
- Check `sudo systemctl status kiosk.service` or `journalctl -u kiosk.service -n 30`.
- Verify the user and paths in the service file (`/etc/systemd/system/kiosk.service`).
- Test manually: `xinit ~/kiosk.sh -- :0 -nocursor`

**MagicMirror page won't load:**
- Check network connectivity: `ping <LXC-CONTAINER-IP>`
- Check if MagicMirror is listening: `curl http://<IP>:8080`
- In MagicMirror's `config.js`, make sure `address: "0.0.0.0"` is set and the Pi's IP is in `ipWhitelist`.
