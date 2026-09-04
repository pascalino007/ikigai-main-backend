import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // /metrics itself is scraped every few seconds — measuring it would just
    // add scrape noise to its own histogram.
    if (req.path === '/metrics') return next();

    const stop = this.metrics.httpRequestDuration.startTimer();
    res.on('finish', () => {
      // req.route is only set once Nest's router matches — falls back to the
      // raw path so 404s still get recorded without unbounded label cardinality
      // from path params (route stays e.g. "/bookings/:id", not "/bookings/42").
      const route = (req.route?.path as string | undefined) ?? req.path;
      stop({ method: req.method, route, status_code: String(res.statusCode) });
    });
    next();
  }
}
