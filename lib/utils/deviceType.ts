import type { DeviceType } from '@/lib/types'

const HOSTNAME_RULES: [RegExp, DeviceType][] = [
  [/iphone|android|pixel|galaxy-?s|oneplus|xiaomi|redmi|huawei-p|phone/i, 'phone'],
  [/ipad|tab(let)?\b|galaxy-?tab|kindle/i, 'tablet'],
  [/macbook|laptop|thinkpad|xps|surface|notebook/i, 'laptop'],
  [/imac|desktop|workstation|\bpc\b|mac-?mini|mac-?studio/i, 'desktop'],
  [/\btv\b|-tv|tv-|roku|chromecast|fire-?tv|bravia|appletv|apple-tv|shield/i, 'tv'],
  [/xbox|playstation|ps[45]|nintendo|switch/i, 'console'],
  [/echo|alexa|sonos|homepod|google-?home|nest-?(mini|audio)|speaker/i, 'speaker'],
  [/cam(era)?\b|ring-|doorbell|arlo|wyze|reolink/i, 'camera'],
  [/printer|laserjet|officejet|deskjet|epson|brother|canon-?(mf|pixma)/i, 'printer'],
  [/watch|fitbit|garmin/i, 'wearable'],
  [/router|gateway|\bap\b|access-?point|rt-ax|rt-ac|unifi|mesh/i, 'router'],
  [/nas|server|raspberrypi|pihole|synology|qnap|homeassistant/i, 'server'],
  [/esp[-_]|shelly|tasmota|tuya|plug|bulb|hue|thermostat|nest|sensor/i, 'iot'],
]

const VENDOR_RULES: [RegExp, DeviceType][] = [
  [/espressif|tuya|shelly|allterco|lifi labs|signify|philips lighting|ecobee|tp-link.*(kasa|tapo)/i, 'iot'],
  [/sonos|bose|amazon technologies/i, 'speaker'],
  [/roku|vizio|lg electronics|tcl|hisense/i, 'tv'],
  [/nintendo|sony interactive|microsoft.*xbox/i, 'console'],
  [/raspberry pi|synology|qnap/i, 'server'],
  [/hewlett packard|seiko epson|brother industries|canon/i, 'printer'],
  [/ring llc|arlo|wyze|hikvision|dahua|reolink/i, 'camera'],
  [/asustek|netgear|ubiquiti|tp-link|linksys|eero|mikrotik/i, 'router'],
  [/fitbit|garmin/i, 'wearable'],
]

/** Best-effort guess for a newly discovered device. Users can always override it. */
export function inferDeviceType(hostname: string | null | undefined, manufacturer: string | null | undefined): DeviceType {
  if (hostname) for (const [re, type] of HOSTNAME_RULES) if (re.test(hostname)) return type
  if (manufacturer) for (const [re, type] of VENDOR_RULES) if (re.test(manufacturer)) return type
  return 'unknown'
}
