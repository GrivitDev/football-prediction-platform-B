import { UAParser } from 'ua-parser-js';

export function parseDevice(userAgent: string) {
  const parser = new UAParser(userAgent);

  const result = parser.getResult();

  const browser = result.browser.name || 'Unknown Browser';

  const os = result.os.name || 'Unknown OS';

  const device = result.device.model || result.device.type || 'Desktop';

  return `${device} • ${os} • ${browser}`;
}
