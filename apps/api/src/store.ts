import type { Pool } from 'pg';
import type { Challenge } from '@zk-auth/shared';
export interface Application {
  id: string;
  origins: string[];
  nullifierSeed: string;
}
export interface Store {
  getApp(id: string): Promise<Application | undefined>;
  saveChallenge(c: Challenge): Promise<void>;
  getChallenge(id: string): Promise<Challenge | undefined>;
  consumeChallenge(id: string): Promise<boolean>;
}
export class PgStore implements Store {
  constructor(private db: Pool) {}
  async getApp(id: string) {
    const r = await this.db.query(
      'SELECT id, origins, nullifier_seed FROM applications WHERE id=$1',
      [id],
    );
    const a = r.rows[0];
    return a && { id: a.id, origins: a.origins, nullifierSeed: a.nullifier_seed };
  }
  async saveChallenge(c: Challenge) {
    await this.db.query('INSERT INTO challenges(id,payload,expires_at) VALUES($1,$2,$3)', [
      c.id,
      c,
      c.expiresAt,
    ]);
  }
  async getChallenge(id: string) {
    const r = await this.db.query('SELECT payload FROM challenges WHERE id=$1', [id]);
    return r.rows[0]?.payload as Challenge | undefined;
  }
  async consumeChallenge(id: string) {
    const r = await this.db.query(
      'UPDATE challenges SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING id',
      [id],
    );
    return r.rowCount === 1;
  }
}
