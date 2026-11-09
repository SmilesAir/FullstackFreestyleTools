import type { Dictionary } from '../dictionaries';
import { activity } from './activity';
import { admin } from './admin';
import { common } from './common';
import { db } from './db';
import { discord } from './discord';
import { errors } from './errors';
import { eventEditor } from './eventEditor';
import { eventMusic } from './eventMusic';
import { eventRegistration } from './eventRegistration';
import { events } from './events';
import { headJudge } from './headJudge';
import { home } from './home';
import { judging } from './judging';
import { login } from './login';
import { players } from './players';
import { profile } from './profile';
import { publicPages } from './publicPages';
import { rankings } from './rankings';
import { results } from './results';
import { resultsParser } from './resultsParser';
import { supportChat } from './supportChat';
import { tools } from './tools';
import { trainer } from './trainer';
import { wiki } from './wiki';

// Latin American Spanish. Typed as the English dictionary, so a missing or mis-shaped
// entry fails the build.
export const es: Dictionary = { activity, admin, common, db, discord, errors, eventEditor, eventMusic, eventRegistration, events, headJudge, home, judging, login, players, profile, publicPages, rankings, results, resultsParser, supportChat, tools, trainer, wiki };
