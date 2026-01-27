import type { IObservationStore } from '../../../src/storage/interfaces.ts';
import type { Observation } from '../../../src/core/types.ts';

export class MockObservationStore implements IObservationStore {
  observations: Map<string, Observation> = new Map();
  createCalls: Array<Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>> = [];
  updateCalls: Array<{ id: string; partial: Partial<Observation> }> = [];
  getAllCalls: number = 0;

  async load(): Promise<void> {
  }

  async save(): Promise<void> {
  }

  async count(): Promise<number> {
    return this.observations.size;
  }

  async clear(): Promise<void> {
    this.observations.clear();
  }

  async create(observation: Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>): Promise<Observation> {
    this.createCalls.push(observation);

    const newObs: Observation = {
      ...observation,
      id: crypto.randomUUID(),
      firstSeen: new Date(),
      lastSeen: new Date(),
    };

    this.observations.set(newObs.id, newObs);
    return newObs;
  }

  async bulkCreate(observations: Array<Omit<Observation, 'id' | 'firstSeen' | 'lastSeen'>>): Promise<Observation[]> {
    const created: Observation[] = [];
    for (const obs of observations) {
      created.push(await this.create(obs));
    }
    return created;
  }

  async getById(id: string): Promise<Observation | null> {
    return this.observations.get(id) || null;
  }

  async getAll(): Promise<Observation[]> {
    this.getAllCalls++;
    return Array.from(this.observations.values());
  }

  async getPending(): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter(obs => obs.status === 'pending');
  }

  async getApproved(): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter(obs => obs.status === 'approved');
  }

  async getDenied(): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter(obs => obs.status === 'denied');
  }

  async getByStatus(status: Observation['status']): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter(obs => obs.status === status);
  }

  async query(): Promise<Observation[]> {
    return Array.from(this.observations.values());
  }

  async filter(predicate: (obs: Observation) => boolean): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter(predicate);
  }

  async incrementCount(id: string, increment: number = 1): Promise<Observation> {
    const obs = this.observations.get(id);
    if (!obs) {
      throw new Error(`Observation not found: ${id}`);
    }
    obs.count += increment;
    obs.lastSeen = new Date();
    return obs;
  }

  async updateLastSeen(id: string): Promise<Observation> {
    const obs = this.observations.get(id);
    if (!obs) {
      throw new Error(`Observation not found: ${id}`);
    }
    obs.lastSeen = new Date();
    return obs;
  }

  async setStatus(id: string, status: Observation['status']): Promise<Observation> {
    const obs = this.observations.get(id);
    if (!obs) {
      throw new Error(`Observation not found: ${id}`);
    }
    obs.status = status;
    return obs;
  }

  async addSessionRef(id: string, sessionId: string): Promise<Observation> {
    const obs = this.observations.get(id);
    if (!obs) {
      throw new Error(`Observation not found: ${id}`);
    }
    if (!obs.sourceSessionIds.includes(sessionId)) {
      obs.sourceSessionIds.push(sessionId);
    }
    return obs;
  }

  async update(id: string, partial: Partial<Observation>): Promise<Observation> {
    this.updateCalls.push({ id, partial });

    const obs = this.observations.get(id);
    if (!obs) {
      throw new Error(`Observation not found: ${id}`);
    }
    Object.assign(obs, partial);
    return obs;
  }

  async bulkUpdate(updates: Array<{ id: string; partial: Partial<Observation> }>): Promise<Observation[]> {
    const results: Observation[] = [];
    for (const { id, partial } of updates) {
      results.push(await this.update(id, partial));
    }
    return results;
  }

  async delete(id: string): Promise<boolean> {
    return this.observations.delete(id);
  }

  async deleteByStatus(status: Observation['status']): Promise<number> {
    let count = 0;
    for (const [id, obs] of this.observations.entries()) {
      if (obs.status === status) {
        this.observations.delete(id);
        count++;
      }
    }
    return count;
  }

  async findSimilar(): Promise<Observation | null> {
    return null;
  }

  async getPromotable(): Promise<Observation[]> {
    return Array.from(this.observations.values()).filter(obs => obs.status === 'approved' && obs.count >= 3);
  }

  reset(): void {
    this.observations.clear();
    this.createCalls = [];
    this.updateCalls = [];
    this.getAllCalls = 0;
  }

  getCreateCallCount(): number {
    return this.createCalls.length;
  }

  getUpdateCallCount(): number {
    return this.updateCalls.length;
  }
}
