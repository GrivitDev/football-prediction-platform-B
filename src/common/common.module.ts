import { Module } from '@nestjs/common';
import { GeoLocationService } from './services/geo-location.service';

@Module({
  providers: [GeoLocationService],
  exports: [GeoLocationService],
})
export class CommonModule {}
