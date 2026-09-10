import { parse } from 'csv-parse';
import { Readable } from 'node:stream';

/**
 * Parses an RFC-4180 compliant CSV stream into an async generator of record objects.
 *
 * Adheres strictly to the Change 02 architectural specification:
 * 1. Preserves raw field characters without automatic trimming (trim: false).
 * 2. Emits empty strings for blank fields without converting to null.
 * 3. Strips UTF-8 BOM from headers automatically.
 * 4. Seamlessly handles CRLF and embedded multiline quoted fields.
 */
export async function* parseCsvStream(
  stream: Readable
): AsyncGenerator<Record<string, string>, void, unknown> {
  const parser = stream.pipe(
    parse({
      columns: true,
      bom: true,
      trim: false,
      skip_empty_lines: true,
      relax_quotes: false,
      escape: '"',
    })
  );

  for await (const record of parser) {
    yield record as Record<string, string>;
  }
}
