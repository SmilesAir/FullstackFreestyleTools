'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadRegistrationTeams } from '@/lib/registration-teams';
import { toSlots } from '@/lib/roster-review';
import { RostersReview, type FoundDivision } from './RostersReview';
import { useT } from '@/lib/i18n/client';

type Loaded = Extract<Awaited<ReturnType<typeof loadRegistrationTeams>>, { noForm: false }>;

// The teams the event's registrations describe: each registered player with the
// teammates they named for each division, matched to players for review, then added
// like pasted teams. Teams already in a division are left out, so it can be run again
// as more people register.
export function RegistrationTeamsForm({ eventId, existing }: { eventId: string; existing: string[] }) {
  const router = useRouter();
  const t = useT();
  const [paidOnly, setPaidOnly] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [noForm, setNoForm] = useState(false);
  const [found, setFound] = useState<FoundDivision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  function load(options: { paidOnly: boolean; teammatesQuestionId: string | null }) {
    setError(null);
    setNotice(null);
    startLoad(async () => {
      const result = await loadRegistrationTeams(eventId, options);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      if (result.noForm) {
        setNoForm(true);
        return;
      }
      setNoForm(false);
      setLoaded(result);
      setQuestionId(result.teammatesQuestionId);
      setFound(result.divisions.map((d) => ({ divisionName: d.divisionName, teams: toSlots(d.teams) })));
    });
  }

  function added(message: string) {
    setNotice(message);
    setFound(null);
    setLoaded(null);
    router.refresh();
  }

  const alone = loaded?.alone ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">{t.events.fromRegistrationHelp}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} />
          {t.events.onlyPaid}
        </label>
        {loaded && loaded.teammateQuestions.length > 1 && (
          <label className="flex items-center gap-1.5">
            {t.events.teammatesFrom}
            <select
              value={questionId ?? ''}
              onChange={(e) => setQuestionId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              {loaded.teammateQuestions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button
        type="button"
        onClick={() => load({ paidOnly, teammatesQuestionId: questionId })}
        disabled={loading}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? t.events.loadingRegistration : t.events.loadRegistration}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      {noForm && (
        <p className="text-sm text-amber-800">
          {t.events.noRegistrationForm}{' '}
          <Link href={`/event-registration?event=${eventId}`} className="text-blue-600 underline">
            {t.events.openEventRegistration}
          </Link>
        </p>
      )}

      {loaded && found && (
        <RostersReview
          eventId={eventId}
          existing={existing}
          found={found}
          setFound={setFound}
          onAdded={added}
          onError={setError}
          emptyMessage={t.events.noRegistrationTeams}
        >
          <p className="text-sm text-gray-600">{t.events.registrationSummary(loaded.registrations, loaded.alreadyAdded)}</p>
          {alone.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
              <div className="font-medium text-amber-800">{t.events.withoutTeam}</div>
              <ul className="text-amber-900">
                {alone.map((d) => (
                  <li key={d.divisionName}>
                    <span className="font-medium">{d.divisionName}:</span>{' '}
                    {d.players.map((p, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        {p.name}
                        {p.lookingForPartner && <span className="text-xs text-amber-700"> ({t.events.lookingForPartner})</span>}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </RostersReview>
      )}
    </div>
  );
}
