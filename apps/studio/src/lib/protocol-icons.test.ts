import { describe, expect, it } from 'vitest';
import { PROTOCOLS, PROTOCOL_ICONS, getProtocolIcon } from './protocol-icons';

describe('PROTOCOLS', () => {
  it('contains expected protocol entries', () => {
    expect(PROTOCOLS.length).toBeGreaterThan(0);
    const ids = PROTOCOLS.map((p) => p.id);
    expect(ids).toContain('pyth');
    expect(ids).toContain('jupiter');
    expect(ids).toContain('raydium');
  });

  it('each protocol has id, name, and icon', () => {
    for (const protocol of PROTOCOLS) {
      expect(protocol.id).toBeTruthy();
      expect(protocol.name).toBeTruthy();
      expect(protocol.icon).toBeTruthy();
    }
  });
});

describe('PROTOCOL_ICONS', () => {
  it('maps protocol IDs to icon paths', () => {
    expect(PROTOCOL_ICONS['pyth']).toBe('/assets/pyth.svg');
    expect(PROTOCOL_ICONS['jupiter']).toBe('/assets/jupiter.svg');
  });

  it('has the same number of entries as PROTOCOLS', () => {
    expect(Object.keys(PROTOCOL_ICONS).length).toBe(PROTOCOLS.length);
  });
});

describe('getProtocolIcon', () => {
  it('returns icon for known protocol', () => {
    expect(getProtocolIcon('pyth')).toBe('/assets/pyth.svg');
  });

  it('returns default fallback for unknown protocol', () => {
    expect(getProtocolIcon('unknown')).toBe('/assets/surfpool.svg');
  });

  it('returns custom fallback for unknown protocol', () => {
    expect(getProtocolIcon('unknown', '/custom/fallback.svg')).toBe('/custom/fallback.svg');
  });
});
