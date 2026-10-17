class CircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private circuitOpen: boolean = false;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(sourceName: string = 'unknown', failureThreshold: number = 5, cooldownSeconds: number = 7200) {
    void sourceName;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownSeconds * 1000;
  }

  get isOpen(): boolean {
    if (!this.circuitOpen) return false;
    if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.cooldownMs) {
      return false;
    }
    return true;
  }

  get failures(): number {
    return this.failureCount;
  }

  onSuccess(): void {
    this.failureCount = 0;
    this.circuitOpen = false;
    this.lastFailureTime = null;
  }

  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpen = true;
    }
  }

  reset(): void {
    this.failureCount = 0;
    this.circuitOpen = false;
    this.lastFailureTime = null;
  }

  getState(): 'closed' | 'open' | 'half_open' {
    if (!this.circuitOpen) return 'closed';
    if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.cooldownMs) {
      const remaining = (this.lastFailureTime + this.cooldownMs) - Date.now();
      return remaining <= 0 ? 'half_open' : 'open';
    }
    return 'open';
  }
}

export { CircuitBreaker };
