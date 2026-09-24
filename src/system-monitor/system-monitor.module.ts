import { Global, Module } from '@nestjs/common';

import { SystemMonitorController } from './system-monitor.controller';
import { SystemMonitorService } from './system-monitor.service';

@Global()
@Module({
  controllers: [SystemMonitorController],

  providers: [SystemMonitorService],

  exports: [SystemMonitorService],
})
export class SystemMonitorModule {}
