import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { PlanConfig, PlanConfigDocument } from './schemas/plan-config.schema';

@Injectable()
export class PlanConfigService {
  constructor(
    @InjectModel(PlanConfig.name)
    private model: Model<PlanConfigDocument>,
  ) {}

  async get() {
    let config = await this.model.findOne();

    if (!config) {
      config = await this.model.create({});
    }

    return config;
  }

  async update(data: Partial<PlanConfig>) {
    const config = await this.get();

    Object.assign(config, data);

    return config.save();
  }
}
