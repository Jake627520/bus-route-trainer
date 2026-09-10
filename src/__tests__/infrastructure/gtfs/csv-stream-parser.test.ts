import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { parseCsvStream } from '@/infrastructure/gtfs/parser/csv-stream-parser';

describe('RFC-4180 CSV Stream Parser Contract', () => {
  it('preserves exact raw string values without global trim', async () => {
    const csvContent = 'id,name\n1," Brisbane Central "\n2, South Bank \n';
    const stream = Readable.from([csvContent]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records).toHaveLength(2);
    expect(records[0].name).toBe(' Brisbane Central ');
    expect(records[1].name).toBe(' South Bank ');
  });

  it('preserves empty strings between commas without converting to null', async () => {
    const csvContent = 'id,code,desc\n1,,optional description\n2,CODE,\n';
    const stream = Readable.from([csvContent]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records[0].code).toBe('');
    expect(records[0].desc).toBe('optional description');
    expect(records[1].code).toBe('CODE');
    expect(records[1].desc).toBe('');
  });

  it('handles escaped double quotes and commas within quoted fields', async () => {
    const csvContent = 'id,text\n1,"He said, ""Welcome to Queensland!"""\n';
    const stream = Readable.from([csvContent]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records).toHaveLength(1);
    expect(records[0].text).toBe('He said, "Welcome to Queensland!"');
  });

  it('handles embedded newlines within quoted fields', async () => {
    const csvContent = 'id,multiline\n1,"Line 1\nLine 2\r\nLine 3"\n';
    const stream = Readable.from([csvContent]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records).toHaveLength(1);
    expect(records[0].multiline).toBe('Line 1\nLine 2\r\nLine 3');
  });

  it('handles CRLF line endings', async () => {
    const csvContent = 'route_id,route_name\r\nR66,Bus 66\r\nR100,Bus 100\r\n';
    const stream = Readable.from([csvContent]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records).toHaveLength(2);
    expect(records[0].route_id).toBe('R66');
    expect(records[1].route_id).toBe('R100');
  });

  it('strips UTF-8 BOM from header line', async () => {
    const csvContent = '\uFEFFstop_id,stop_name\nST_01,Brisbane City\n';
    const stream = Readable.from([csvContent]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records).toHaveLength(1);
    expect(records[0]['stop_id']).toBe('ST_01');
    expect(records[0]['\uFEFFstop_id']).toBeUndefined();
  });

  it('handles streaming chunk boundaries gracefully', async () => {
    // Split across random chunk boundaries
    const chunk1 = 'id,val\n1,"A very lo';
    const chunk2 = 'ng quoted string wi';
    const chunk3 = 'th, comma"\n2,simple\n';
    const stream = Readable.from([chunk1, chunk2, chunk3]);
    const records: Record<string, string>[] = [];

    for await (const row of parseCsvStream(stream)) {
      records.push(row);
    }

    expect(records).toHaveLength(2);
    expect(records[0].val).toBe('A very long quoted string with, comma');
    expect(records[1].val).toBe('simple');
  });
});
