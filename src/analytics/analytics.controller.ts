import { Body, Controller, Get, Post, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CreateEventDto } from './dtos/create-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  overview(@Query('days') days?: string) {
    return this.analyticsService.overview(days ? parseInt(days, 10) : 14);
  }
}
