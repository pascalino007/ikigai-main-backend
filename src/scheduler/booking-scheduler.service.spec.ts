import { BookingSchedulerService } from './booking-scheduler.service';

// "Now" is fixed: Monday 2026-09-21, 15:00 local time.
const NOW = new Date(2026, 8, 21, 15, 0);
const DATE = '2026-09-21';
const at = (h: number, m = 0) => new Date(2026, 8, 21, h, m);

/** An IN_SERVICE booking for `worker_id`, scheduled start→end, checked in at `checkedIn`. */
const inService = (worker_id: number, start: Date, end: Date, checkedIn: Date) => ({
  worker_id,
  booking_date: DATE,
  booking_time: start,
  booking_end_time: end,
  checked_in_at: checkedIn,
});

function build(busyWorkerIds: number[], bookings: any[], lockAcquired = true) {
  const workerRepo = {
    find: jest.fn().mockResolvedValue(busyWorkerIds.map((id) => ({ id }))),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const bookingRepo = { find: jest.fn().mockResolvedValue(bookings) };
  const redis = { acquireLock: jest.fn().mockResolvedValue(lockAcquired) };

  const service = new BookingSchedulerService(
    bookingRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    workerRepo as any,
    {} as any,
    redis as any,
  );
  return { service, workerRepo, bookingRepo };
}

/** Ids passed to `workerRepo.update({ id: In(ids) }, { status: 'libre' })`. */
const freedIds = (workerRepo: { update: jest.Mock }) =>
  workerRepo.update.mock.calls.length ? workerRepo.update.mock.calls[0][0].id.value : [];

describe('BookingSchedulerService.releaseStaleBusyWorkers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('frees a busy worker with no IN_SERVICE booking at all', async () => {
    const { service, workerRepo } = build([1], []);
    await service.releaseStaleBusyWorkers();
    expect(freedIds(workerRepo)).toEqual([1]);
    expect(workerRepo.update.mock.calls[0][1]).toEqual({ status: 'libre' });
  });

  it('frees a worker whose service ended long ago (client never checked out)', async () => {
    // 09:00-10:00, checked in 09:05 → expected end 10:05, +60 min grace = 11:05 < 15:00.
    const { service, workerRepo } = build([3], [inService(3, at(9), at(10), at(9, 5))]);
    await service.releaseStaleBusyWorkers();
    expect(freedIds(workerRepo)).toEqual([3]);
  });

  it('keeps a worker busy while their service is still running', async () => {
    const { service, workerRepo } = build([2], [inService(2, at(14), at(15, 30), at(14, 5))]);
    await service.releaseStaleBusyWorkers();
    expect(workerRepo.update).not.toHaveBeenCalled();
  });

  it('keeps a worker busy within the grace period after the scheduled end', async () => {
    // Ended 14:30 → busy until 15:30 with the 60 min grace.
    const { service, workerRepo } = build([2], [inService(2, at(13, 30), at(14, 30), at(13, 30))]);
    await service.releaseStaleBusyWorkers();
    expect(workerRepo.update).not.toHaveBeenCalled();
  });

  it('measures a late check-in from when the client actually arrived', async () => {
    // Scheduled 10:00-11:00 but checked in at 13:45 → expected end 14:45, busy until 15:45.
    const { service, workerRepo } = build([4], [inService(4, at(10), at(11), at(13, 45))]);
    await service.releaseStaleBusyWorkers();
    expect(workerRepo.update).not.toHaveBeenCalled();
  });

  it('only frees the stale workers when several are busy', async () => {
    const { service, workerRepo } = build(
      [1, 2],
      [inService(1, at(9), at(10), at(9, 5)), inService(2, at(14), at(15, 30), at(14, 5))],
    );
    await service.releaseStaleBusyWorkers();
    expect(freedIds(workerRepo)).toEqual([1]);
  });

  it('does nothing when no worker is busy', async () => {
    const { service, workerRepo, bookingRepo } = build([], []);
    await service.releaseStaleBusyWorkers();
    expect(bookingRepo.find).not.toHaveBeenCalled();
    expect(workerRepo.update).not.toHaveBeenCalled();
  });

  it('does nothing when another instance holds the cron lock', async () => {
    const { service, workerRepo } = build([1], [], false);
    await service.releaseStaleBusyWorkers();
    expect(workerRepo.find).not.toHaveBeenCalled();
    expect(workerRepo.update).not.toHaveBeenCalled();
  });
});
