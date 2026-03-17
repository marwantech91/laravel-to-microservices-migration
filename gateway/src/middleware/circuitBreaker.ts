import { Request, Response, NextFunction } from 'express';

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerState {
  state: State;
  failures: number;
  lastFailure: number;
  successes: number;
}

const breakers = new Map<string, BreakerState>();

const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT = 30000; // 30 seconds
const SUCCESS_THRESHOLD = 2;

function getBreaker(service: string): BreakerState {
  if (!breakers.has(service)) {
    breakers.set(service, { state: 'CLOSED', failures: 0, lastFailure: 0, successes: 0 });
  }
  return breakers.get(service)!;
}

/**
 * Per-service circuit breaker at the gateway level.
 * If a service is unhealthy, fail fast instead of waiting for timeouts.
 */
export function circuitBreaker(service: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const breaker = getBreaker(service);

    if (breaker.state === 'OPEN') {
      // Check if recovery timeout has passed
      if (Date.now() - breaker.lastFailure > RECOVERY_TIMEOUT) {
        breaker.state = 'HALF_OPEN';
        breaker.successes = 0;
      } else {
        res.status(503).json({
          error: `Service ${service} is temporarily unavailable`,
          retryAfter: Math.ceil((RECOVERY_TIMEOUT - (Date.now() - breaker.lastFailure)) / 1000),
        });
        return;
      }
    }

    // Track response for circuit breaker
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      if (res.statusCode >= 500) {
        breaker.failures++;
        breaker.lastFailure = Date.now();
        breaker.successes = 0;

        if (breaker.failures >= FAILURE_THRESHOLD) {
          breaker.state = 'OPEN';
          console.warn(`Circuit OPEN for ${service} after ${breaker.failures} failures`);
        }
      } else {
        if (breaker.state === 'HALF_OPEN') {
          breaker.successes++;
          if (breaker.successes >= SUCCESS_THRESHOLD) {
            breaker.state = 'CLOSED';
            breaker.failures = 0;
            console.info(`Circuit CLOSED for ${service}`);
          }
        } else {
          breaker.failures = 0;
        }
      }

      return originalEnd.apply(res, args);
    } as any;

    next();
  };
}

// Expose for health endpoint
export function getCircuitStatus(): Record<string, { state: State; failures: number }> {
  const status: Record<string, { state: State; failures: number }> = {};
  breakers.forEach((breaker, service) => {
    status[service] = { state: breaker.state, failures: breaker.failures };
  });
  return status;
}
