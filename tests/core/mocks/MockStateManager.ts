export class MockStateManager {
  private lastAnalysisRun: Date | null = null;
  private updateCalls: Date[] = [];

  getLastAnalysisRun(): Date | null {
    return this.lastAnalysisRun;
  }

  async updateLastAnalysisRun(timestamp: Date): Promise<void> {
    this.updateCalls.push(timestamp);
    this.lastAnalysisRun = timestamp;
  }

  setLastAnalysisRun(timestamp: Date | null): void {
    this.lastAnalysisRun = timestamp;
  }

  getUpdateCallCount(): number {
    return this.updateCalls.length;
  }

  getLastUpdateCall(): Date | undefined {
    return this.updateCalls[this.updateCalls.length - 1];
  }

  reset(): void {
    this.lastAnalysisRun = null;
    this.updateCalls = [];
  }
}
