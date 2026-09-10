import { describe, it, expect } from 'vitest';

describe('Bus Route Trainer - Foundation Test Suite', () => {
  it('verifies testing environment and basic assertion capabilities', () => {
    const appName = 'Bus Route Trainer';
    const locale = 'en-AU';

    expect(appName).toBe('Bus Route Trainer');
    expect(locale).toBe('en-AU');
  });

  it('verifies Zod schema validation for route number', async () => {
    const { z } = await import('zod');
    const routeSchema = z.object({
      routeShortName: z.string().min(1),
      routeLongName: z.string().min(1),
    });

    const validRoute = {
      routeShortName: '66',
      routeLongName: 'RBWH - UQ Lakes via Cultural Centre',
    };

    const parsed = routeSchema.safeParse(validRoute);
    expect(parsed.success).toBe(true);
  });
});
