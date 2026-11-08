import { StrKey, nativeToScVal } from '@stellar/stellar-sdk';
export const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));
export function event(index, account, amount) {
  return { id: (100n * 4294967296n + 4096n).toString().padStart(19, '0') + '-' + String(index).padStart(10, '0'), type: 'contract', ledger: 100, ledgerClosedAt: '2026-11-01T00:00:00Z', contractId, txHash: 'a'.repeat(64), inSuccessfulContractCall: true,
    topic: [nativeToScVal('credit', { type: 'symbol' }).toXDR('base64'), nativeToScVal(account, { type: 'symbol' }).toXDR('base64')],
    value: nativeToScVal({ amount: nativeToScVal(amount, { type: 'u32' }) }).toXDR('base64') };
}
export const fixture = { schemaVersion: 1, source: 'synthetic-offline-fixture', networkPassphrase: 'Test SDF Network ; September 2015', contractId, startLedger: 100, endLedger: 101, complete: true, events: [event(0, 'alice', 4), event(1, 'bob', 7), event(2, 'alice', 6)] };
export const expected = { schemaVersion: 1, orderIndependent: true, state: { balances: { alice: '10', bob: '7' } } };
