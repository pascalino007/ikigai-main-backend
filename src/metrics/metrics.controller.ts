import { Controller, Get, Header } from '@nestjs/common';
import { contentType } from 'prom-client';
import { MetricsService } from './metrics.service';

// Scraped by Prometheus over the compose-internal network — not routed through
// the public reverse proxy (see DEPLOY.md's monitoring section).
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', contentType)
  async scrape(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
