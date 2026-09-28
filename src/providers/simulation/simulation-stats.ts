// Counters that let us SEE what happens inside a provider.
// They become important later:
//   Stage 6: are timed-out calls still running? (inFlight stays > 0)
//   Stage 10: does the bulkhead really cap concurrency? (maxInFlight)
export class SimulationStats {
  totalCalls = 0;
  inFlight = 0; // calls started but not finished yet
  maxInFlight = 0; // highest inFlight value ever seen

  start(): void {
    this.totalCalls++;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
  }

  finish(): void {
    this.inFlight--;
  }
}
