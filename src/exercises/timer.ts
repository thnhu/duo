// Reaction-time clock (spec section 11: "do lõi thực hiện thống nhất, không
// để từng module tự đo"). Starts when the question appears on screen and
// stops when PO submits the answer (journey assumption G3).

export class ReflexTimer {
  private startedAt: number | null = null;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  start(): void {
    this.startedAt = this.now();
  }

  isRunning(): boolean {
    return this.startedAt !== null;
  }

  // Milliseconds since start(); the clock is then reset so a double submit
  // can't be timed twice.
  stop(): number {
    if (this.startedAt === null) return 0;
    const elapsed = Math.max(0, Math.round(this.now() - this.startedAt));
    this.startedAt = null;
    return elapsed;
  }
}
