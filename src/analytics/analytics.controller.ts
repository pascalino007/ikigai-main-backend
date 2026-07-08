import { Body, Controller, Get, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CreateEventDto } from './dtos/create-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** POST /analytics/events — record an event from the mobile app. */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  record(@Body() dto: CreateEventDto) {
    return this.analyticsService.record(dto);
  }

  /** GET /analytics/overview?days=14 — aggregated metrics for the dashboard. */
  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.analyticsService.overview(days ? parseInt(days, 10) : 14);
  }
}
