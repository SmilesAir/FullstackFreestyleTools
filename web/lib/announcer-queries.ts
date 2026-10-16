import 'server-only';
import { getPlayState } from './head-judge-queries';
import type { AnnouncerPoll } from './announcer';

export async function getAnnouncerPoll(eventId: string): Promise<AnnouncerPoll> {
  const play = await getPlayState(eventId);
  return {
    divisionId: play.state.divisionId,
    roundNumber: play.state.roundNumber,
    poolLetter: play.state.poolLetter,
    teamId: play.state.teamId,
    routineStartedAt: play.state.routineStartedAt,
    serverNow: play.serverNow,
    structureKey: play.structureKey,
    mode: play.mode,
  };
}
