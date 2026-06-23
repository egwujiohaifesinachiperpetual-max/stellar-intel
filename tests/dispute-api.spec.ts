// @vitest-environment node
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { POST, clearDisputeStores } from '@/app/api/reputation/dispute/route';
import { NextRequest } from 'next/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIntentHash(): string {
  return 'a'.repeat(64); // valid 64-char hex
}

function signHash(keypair: Keypair, intentHash: string): string {
  const messageBytes = Buffer.from(intentHash, 'hex');
  const sig = keypair.sign(messageBytes);
  return Buffer.from(sig).toString('base64');
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reputation/dispute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/reputation/dispute', () => {
  let keypair: Keypair;
  const intentHash = makeIntentHash();

  beforeAll(() => {
    keypair = Keypair.random();
  });

  beforeEach(() => {
    clearDisputeStores();
  });

  it('returns 201 and sets disputed:true for a valid signed request', async () => {
    const signature = signHash(keypair, intentHash);
    const res = await POST(
      makeRequest({
        intentHash,
        publicKey: keypair.publicKey(),
        signature,
        anchorId: 'moneygram',
        reason: 'transaction never settled',
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.disputed).toBe(true);
    expect(body.intentHash).toBe(intentHash);
    expect(body.anchorId).toBe('moneygram');
    expect(body.publicKey).toBe(keypair.publicKey());
  });

  it('returns 403 when signature is invalid', async () => {
    const res = await POST(
      makeRequest({
        intentHash,
        publicKey: keypair.publicKey(),
        signature: Buffer.alloc(64).toString('base64'), // wrong signature
        anchorId: 'moneygram',
        reason: 'fraud',
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 403 when signature belongs to a different keypair', async () => {
    const other = Keypair.random();
    const signature = signHash(other, intentHash); // signed by wrong key
    const res = await POST(
      makeRequest({
        intentHash,
        publicKey: keypair.publicKey(),
        signature,
        anchorId: 'cowrie',
        reason: 'wrong rate',
      })
    );
    expect(res.status).toBe(403);
  });

  it('returns 422 when intentHash has wrong format', async () => {
    const res = await POST(
      makeRequest({
        intentHash: 'not-a-sha256',
        publicKey: keypair.publicKey(),
        signature: 'abc',
        anchorId: 'moneygram',
        reason: 'test',
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when publicKey has wrong format', async () => {
    const res = await POST(
      makeRequest({
        intentHash,
        publicKey: 'not-a-stellar-key',
        signature: 'abc',
        anchorId: 'moneygram',
        reason: 'test',
      })
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when required fields are missing', async () => {
    const res = await POST(makeRequest({ intentHash, publicKey: keypair.publicKey() }));
    expect(res.status).toBe(422);
  });

  it('returns 400 for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/reputation/dispute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_JSON');
  });

  it('enforces 10-dispute-per-24h rate limit per publicKey', async () => {
    const signature = signHash(keypair, intentHash);
    const payload = {
      intentHash,
      publicKey: keypair.publicKey(),
      signature,
      anchorId: 'moneygram',
      reason: 'test',
    };

    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest(payload));
      expect(res.status).toBe(201);
    }

    const limited = await POST(makeRequest(payload));
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('allows a different publicKey after the first key is rate-limited', async () => {
    const other = Keypair.random();
    const sig1 = signHash(keypair, intentHash);
    const sig2 = signHash(other, intentHash);
    const base1 = { intentHash, publicKey: keypair.publicKey(), signature: sig1, anchorId: 'a', reason: 'r' };
    const base2 = { intentHash, publicKey: other.publicKey(), signature: sig2, anchorId: 'a', reason: 'r' };

    for (let i = 0; i < 10; i++) await POST(makeRequest(base1));
    expect((await POST(makeRequest(base1))).status).toBe(429);
    expect((await POST(makeRequest(base2))).status).toBe(201);
  });

  it('excludes disputed rows from GET /api/reputation/[anchor] scorecards', async () => {
    const { outcomeStore } = await import('@/app/api/reputation/[anchor]/route');
    const { GET } = await import('@/app/api/reputation/[anchor]/route');

    // Seed the store with two outcome rows
    const hashA = makeIntentHash();
    const hashB = 'b'.repeat(64);
    
    outcomeStore.length = 0;
    outcomeStore.push(
      {
        intentHash: hashA,
        anchorId: 'moneygram',
        filled: true,
        settleMs: 5000,
        slippage: 0.01,
        recordedAt: Date.now() - 1000,
      },
      {
        intentHash: hashB,
        anchorId: 'moneygram',
        filled: true,
        settleMs: 10000,
        slippage: 0.02,
        recordedAt: Date.now() - 2000,
      }
    );

    // Verify initially they are both in the scorecard (sample size = 2)
    const getReq1 = new NextRequest('http://localhost/api/reputation/moneygram');
    const resGet1 = await GET(getReq1, { params: Promise.resolve({ anchor: 'moneygram' }) });
    const bodyGet1 = await resGet1.json();
    expect(bodyGet1.scorecards[7].sampleSize).toBe(2);

    // Now dispute hashB
    const signature = signHash(keypair, hashB);
    const resDispute = await POST(
      makeRequest({
        intentHash: hashB,
        publicKey: keypair.publicKey(),
        signature,
        anchorId: 'moneygram',
        reason: 'transaction never settled',
      })
    );
    expect(resDispute.status).toBe(201);

    // Verify hashB is now marked disputed in outcomeStore
    const rowB = outcomeStore.find(r => r.intentHash === hashB);
    expect(rowB?.disputed).toBe(true);
    expect(rowB?.disputed_reason).toBe('transaction never settled');

    // Query scorecard again, should only include hashA (sample size = 1)
    const getReq2 = new NextRequest('http://localhost/api/reputation/moneygram');
    const resGet2 = await GET(getReq2, { params: Promise.resolve({ anchor: 'moneygram' }) });
    const bodyGet2 = await resGet2.json();
    expect(bodyGet2.scorecards[7].sampleSize).toBe(1);
  });
});

