import type { LLMAdapter } from '../../../src/adapters/llm/LLMAdapter.ts';
import type { Session, Observation } from '../../../src/core/types.ts';

export class MockLLMAdapter implements LLMAdapter {
  name = 'mock-llm';
  observations: Observation[] = [];
  callCount = 0;
  similarityCalls: { a: Observation; b: Observation }[] = [];
  similarityMap = new Map<string, boolean>();

  constructor(observations: Observation[] = []) {
    this.observations = observations;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async extractPatterns(session: Session): Promise<Observation[]> {
    this.callCount++;
    return this.observations;
  }

  async checkSimilarity(a: Observation, b: Observation): Promise<boolean> {
    this.similarityCalls.push({ a, b });

    const key = `${a.id}-${b.id}`;
    if (this.similarityMap.has(key)) {
      return this.similarityMap.get(key)!;
    }

    const reverseKey = `${b.id}-${a.id}`;
    if (this.similarityMap.has(reverseKey)) {
      return this.similarityMap.get(reverseKey)!;
    }

    return a.id === b.id;
  }

  setSimilarity(id1: string, id2: string, similar: boolean): void {
    const key = `${id1}-${id2}`;
    this.similarityMap.set(key, similar);
    this.similarityMap.set(`${id2}-${id1}`, similar);
  }

  getCallCount(): number {
    return this.callCount;
  }

  getSimilarityCallCount(): number {
    return this.similarityCalls.length;
  }

  reset(): void {
    this.callCount = 0;
    this.similarityCalls = [];
    this.similarityMap.clear();
  }
}
