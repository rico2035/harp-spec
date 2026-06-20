/**
 * In-memory state for the reference server. Not for production. A real service
 * would persist these with tenant isolation and an append-only audit log.
 */

export interface AgentRecord {
  agentId: string;
  issuer: string;
  subject: string;
  orgId?: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface ClaimCeremony {
  claimToken: string;
  userCode: string;
  loginHint: string;
  approved: boolean;
  agentId: string;
}

export interface BaaAcceptance {
  acceptanceId: string;
  orgId: string;
  versionHash: string;
  acceptedBy: string;
  acceptedAt: string;
}

export class MemoryStore {
  readonly agents = new Map<string, AgentRecord>();
  readonly ceremonies = new Map<string, ClaimCeremony>();
  readonly baaByOrg = new Map<string, BaaAcceptance>();

  putAgent(a: AgentRecord): void {
    this.agents.set(a.agentId, a);
  }

  putCeremony(c: ClaimCeremony): void {
    this.ceremonies.set(c.claimToken, c);
  }

  getCeremony(token: string): ClaimCeremony | undefined {
    return this.ceremonies.get(token);
  }

  recordBaa(b: BaaAcceptance): void {
    this.baaByOrg.set(b.orgId, b);
  }

  hasBaa(orgId: string | undefined): boolean {
    return orgId ? this.baaByOrg.has(orgId) : false;
  }
}
