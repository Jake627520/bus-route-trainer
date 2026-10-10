import { describe, it, expect } from 'vitest';
import { parseStopName } from '@/domain/gtfs/stop-name';

/**
 * Change 45: Translink 站名解析。
 * 測試案例全部取自真實 SEQ GTFS feed（stops.txt），不是編造的。
 * 主流格式為「<街道> at|near <橫向街道/地標>[, stop N]」，約 90% 的站適用。
 */
describe('Change 45: parseStopName', () => {
  it('parses street / relation / landmark / stop number', () => {
    expect(parseStopName('Granadilla St at Ceriman Street, stop 78')).toEqual({
      raw: 'Granadilla St at Ceriman Street, stop 78',
      street: 'Granadilla St',
      relation: 'at',
      landmark: 'Ceriman Street',
      stopNumber: '78',
    });
  });

  it('handles the near relation', () => {
    const p = parseStopName('Granadilla St near Darlington St, stop 7');
    expect(p.relation).toBe('near');
    expect(p.street).toBe('Granadilla St');
    expect(p.landmark).toBe('Darlington St');
    expect(p.stopNumber).toBe('7');
  });

  it('handles a stop number without a comma', () => {
    const p = parseStopName('Cavendish Rd at Seton College stop 59/56');
    expect(p.landmark).toBe('Seton College');
    expect(p.stopNumber).toBe('59/56');
  });

  // 少數站把 Stop N 放在中間：'Ann Street Stop 11 at King George Square'
  it('handles a stop number placed before the relation', () => {
    const p = parseStopName('Ann Street Stop 11 at King George Square');
    expect(p.street).toBe('Ann Street');
    expect(p.relation).toBe('at');
    expect(p.landmark).toBe('King George Square');
    expect(p.stopNumber).toBe('11');
  });

  it('parses a letter stop code on a station stop', () => {
    const p = parseStopName('Garden City Shopping Centre station, stop E');
    expect(p.stopNumber).toBe('E');
    expect(p.street).toBe('Garden City Shopping Centre station');
    expect(p.relation).toBeNull();
    expect(p.landmark).toBeNull();
  });

  // platform 不是 stop number，不可拿來出站號題
  it('does not treat a platform number as a stop number', () => {
    const p = parseStopName('Griffith University station, platform 1');
    expect(p.stopNumber).toBeNull();
    expect(p.landmark).toBeNull();
  });

  it('returns all-null parts for a name with no recognisable structure', () => {
    const p = parseStopName('West End Cityglider terminus');
    expect(p.relation).toBeNull();
    expect(p.landmark).toBeNull();
    expect(p.stopNumber).toBeNull();
  });

  it('is resilient to empty / non-string input', () => {
    expect(parseStopName('').street).toBeNull();
    expect(parseStopName(undefined as unknown as string).raw).toBe('');
  });
});
