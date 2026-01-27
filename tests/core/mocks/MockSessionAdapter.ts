import type { Session, SessionAdapter } from '../../../src/adapters/session/SessionAdapter.ts';

export class MockSessionAdapter implements SessionAdapter {
  name = 'mock-session';
  sessions: Session[] = [];
  availableFlag = true;

  constructor(sessions: Session[] = []) {
    this.sessions = sessions;
  }

  async isAvailable(): Promise<boolean> {
    return this.availableFlag;
  }

  async getSessions(since?: Date): Promise<Session[]> {
    if (!since) return this.sessions;
    return this.sessions.filter(s => s.timestamp.getTime() >= since.getTime());
  }

  setAvailable(available: boolean): void {
    this.availableFlag = available;
  }

  addSessions(sessions: Session[]): void {
    this.sessions.push(...sessions);
  }

  clearSessions(): void {
    this.sessions = [];
  }
}
