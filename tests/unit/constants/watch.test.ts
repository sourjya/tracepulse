/**
 * Unit tests for Phase 2 watch mode constants.
 *
 * Validates that all watch-related constants are exported with expected values
 * and that duration bounds are logically consistent (MIN < DEFAULT < MAX).
 *
 * @see src/constants/watch.ts for the constants under test
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WATCH_DURATION_SECONDS,
  MIN_WATCH_DURATION_SECONDS,
  MAX_WATCH_DURATION_SECONDS,
  ERROR_CONTEXT_WINDOW_MS,
  MAX_SURROUNDING_LOGS,
  DEFAULT_TIMELINE_LIMIT,
  MAX_TIMELINE_LIMIT,
  DEFAULT_BUILD_ERRORS_LIMIT,
  MAX_BUILD_ERRORS_LIMIT,
  HOT_RELOAD_SIGNAL_SCORE,
  BUILD_ERROR_BASE_SIGNAL_SCORE,
} from '@/constants/watch.js';

describe('watch mode constants', () => {
  it('exports all required constants', () => {
    expect(DEFAULT_WATCH_DURATION_SECONDS).toBeDefined();
    expect(MIN_WATCH_DURATION_SECONDS).toBeDefined();
    expect(MAX_WATCH_DURATION_SECONDS).toBeDefined();
    expect(ERROR_CONTEXT_WINDOW_MS).toBeDefined();
    expect(MAX_SURROUNDING_LOGS).toBeDefined();
    expect(DEFAULT_TIMELINE_LIMIT).toBeDefined();
    expect(MAX_TIMELINE_LIMIT).toBeDefined();
    expect(DEFAULT_BUILD_ERRORS_LIMIT).toBeDefined();
    expect(MAX_BUILD_ERRORS_LIMIT).toBeDefined();
    expect(HOT_RELOAD_SIGNAL_SCORE).toBeDefined();
    expect(BUILD_ERROR_BASE_SIGNAL_SCORE).toBeDefined();
  });

  it('has consistent watch duration bounds: MIN < DEFAULT < MAX', () => {
    expect(MIN_WATCH_DURATION_SECONDS).toBeLessThan(DEFAULT_WATCH_DURATION_SECONDS);
    expect(DEFAULT_WATCH_DURATION_SECONDS).toBeLessThan(MAX_WATCH_DURATION_SECONDS);
  });

  it('has watch duration values matching spec', () => {
    expect(MIN_WATCH_DURATION_SECONDS).toBe(1);
    expect(DEFAULT_WATCH_DURATION_SECONDS).toBe(15);
    expect(MAX_WATCH_DURATION_SECONDS).toBe(120);
  });

  it('has error context window of 5 seconds', () => {
    expect(ERROR_CONTEXT_WINDOW_MS).toBe(5_000);
  });

  it('caps surrounding logs at 50', () => {
    expect(MAX_SURROUNDING_LOGS).toBe(50);
  });

  it('has consistent timeline limits: DEFAULT < MAX', () => {
    expect(DEFAULT_TIMELINE_LIMIT).toBeLessThan(MAX_TIMELINE_LIMIT);
    expect(DEFAULT_TIMELINE_LIMIT).toBe(100);
    expect(MAX_TIMELINE_LIMIT).toBe(500);
  });

  it('has consistent build errors limits: DEFAULT < MAX', () => {
    expect(DEFAULT_BUILD_ERRORS_LIMIT).toBeLessThan(MAX_BUILD_ERRORS_LIMIT);
    expect(DEFAULT_BUILD_ERRORS_LIMIT).toBe(20);
    expect(MAX_BUILD_ERRORS_LIMIT).toBe(100);
  });

  it('has signal scores within 0-100 range', () => {
    expect(HOT_RELOAD_SIGNAL_SCORE).toBeGreaterThanOrEqual(0);
    expect(HOT_RELOAD_SIGNAL_SCORE).toBeLessThanOrEqual(100);
    expect(BUILD_ERROR_BASE_SIGNAL_SCORE).toBeGreaterThanOrEqual(0);
    expect(BUILD_ERROR_BASE_SIGNAL_SCORE).toBeLessThanOrEqual(100);
  });

  it('has expected signal score values', () => {
    expect(HOT_RELOAD_SIGNAL_SCORE).toBe(5);
    expect(BUILD_ERROR_BASE_SIGNAL_SCORE).toBe(40);
  });
});
