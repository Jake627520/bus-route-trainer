import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/recall/sessions/[id]/prompt/route';
import { POST } from '@/app/api/recall/sessions/[id]/answer/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { CardState, CardType } from '@/domain/learning/learning-card';
import { SessionStatus, RecallMode, RecallOutcome } from '@/domain/recall/recall-session';

/**
 * Change 50 Task 5: 「上一站是哪裡」——出題給站 B 的站名，答案是前一站 A 的站名。
 */
describe('Change 50: previous-stop question over the session API', () => {
  const prisma = new PrismaClient();
  const routeId = 'route-prev';
  const variantKey = 'route-prev:dir-0:hash-prev';

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
  });

  async function setup() {
    await prisma.gtfsRoute.create({ data: { id: routeId, shortName: 'PV', longName: 'Prev route', routeType: 3 } });
    await prisma.gtfsStop.createMany({
      data: [
        { id: 'stop-prev-a', name: 'Cultural Centre Station', latitude: -27.47, longitude: 153.02 },
        { id: 'stop-prev-b', name: 'Griffith University station, platform 1', latitude: -27.55, longitude: 153.05 },
      ],
    });
    const progress = await prisma.driverVariantProgress.create({
      data: { driverId: DEFAULT_DRIVER_ID, routeId, directionId: 0, targetVariantKey: variantKey },
    });
    const card = await prisma.learningCard.create({
      data: {
        progressId: progress.id,
        cardKey: 'PREV_STOP::stop-prev-a->stop-prev-b',
        cardType: CardType.PREV_STOP,
        state: CardState.NEW,
        srsLevel: 0,
      },
    });
    const session = await prisma.recallSession.create({
      data: {
        driverId: DEFAULT_DRIVER_ID, routeId, targetVariantKey: variantKey,
        status: SessionStatus.IN_PROGRESS, plannedCardIds: [card.id], currentPromptIndex: 0,
      },
    });
    return session;
  }

  const getPrompt = (id: string) =>
    GET(new Request(`http://localhost/api/recall/sessions/${id}/prompt`), { params: Promise.resolve({ id }) });
  const answer = (id: string, rawInput: string) =>
    POST(
      new Request(`http://localhost/api/recall/sessions/${id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptIndex: 0, rawInput }),
      }),
      { params: Promise.resolve({ id }) },
    );

  it('asks for the previous stop: the prompt shows stop B, in PREVIOUS_STOP_BACKWARD mode', async () => {
    const session = await setup();
    const res = await getPrompt(session.id);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.prompt.recallMode).toBe(RecallMode.PREVIOUS_STOP_BACKWARD);
    expect(data.prompt.givenReference).toBe('Griffith University station, platform 1');
  });

  it('P0 safety: the answer (the previous stop\'s NAME) is never in the prompt payload', async () => {
    const session = await setup();
    const json = await (await getPrompt(session.id)).json();
    const raw = JSON.stringify(json);
    expect(raw).not.toContain('Cultural Centre');
    expect(json.data.prompt).not.toHaveProperty('expectedAnswer');
    expect(json.data.prompt).not.toHaveProperty('correctAnswer');
    // 註：cardKey（PREV_STOP::{from}->{to}）本來就會回傳，內含的是 GTFS 的不透明站代碼，
    // 與既有 NEXT_STOP 卡相同；司機要輸入的是站名，不是代碼。
  });

  it('passes a correct answer, with lenient matching (case, abbreviations)', async () => {
    const session = await setup();
    await getPrompt(session.id);
    const res = await answer(session.id, '  cultural centre stn ');
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.outcome).toBe(RecallOutcome.PASS);
    expect(data.correctAnswer).toBeUndefined();
  });

  it('fails a wrong answer and reveals the right one afterwards', async () => {
    const session = await setup();
    await getPrompt(session.id);
    const res = await answer(session.id, 'Roma Street');
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.outcome).toBe(RecallOutcome.FAIL);
    expect(data.correctAnswer).toBe('Cultural Centre Station');
  });

  it('records the attempt as PREVIOUS_STOP_BACKWARD', async () => {
    const session = await setup();
    await getPrompt(session.id);
    await answer(session.id, 'Cultural Centre Station');
    const attempt = await prisma.recallAttempt.findFirstOrThrow({ where: { sessionId: session.id } });
    expect(attempt.recallMode).toBe(RecallMode.PREVIOUS_STOP_BACKWARD);
  });
});
