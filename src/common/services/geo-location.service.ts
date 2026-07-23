import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GeoLocationService {
  async lookup(ip: string) {
    try {
      // Ignore local development IPs
      if (ip === '127.0.0.1' || ip === '::1') {
        return {
          country: 'Localhost',
          city: 'Local Development',
        };
      }

      const response = await axios.get(
        `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone,isp,org,lat,lon`,
      );

      const data = response.data;

      if (data.status !== 'success') {
        return null;
      }

      return {
        country: data.country,

        countryCode: data.countryCode,

        region: data.regionName,

        city: data.city,

        timezone: data.timezone,

        isp: data.isp,

        organization: data.org,

        latitude: data.lat,

        longitude: data.lon,
      };
    } catch (error) {
      console.error('IP location lookup failed', error.message);

      return null;
    }
  }
}
