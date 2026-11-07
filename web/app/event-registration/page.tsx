import { getT } from '@/lib/i18n/server';
import { getFormOrDraft, listRegistrationEvents, listRegistrations, playerNames } from '@/lib/registration-queries';
import { divisionTeammates } from '@/lib/registration';
import { Tabs } from '@/app/_components/Tabs';
import { EventPicker } from './_components/EventPicker';
import { FormBuilder } from './_components/FormBuilder';
import { RegistrationsTable } from './_components/RegistrationsTable';
import { EmbedCode } from './_components/EmbedCode';

export const dynamic = 'force-dynamic';

const TABS = ['form', 'embed', 'registrations'] as const;
type TabId = (typeof TABS)[number];

// Event Registration: pick an event, build its sign-up form from the questions on
// offer, get the code that embeds it on the tournament's site, and see who has
// registered (marking who has paid).
export default async function EventRegistrationPage({ searchParams }: PageProps<'/event-registration'>) {
  const { event: eventParam, tab } = await searchParams;
  const [t, events] = await Promise.all([getT(), listRegistrationEvents()]);
  const tr = t.eventRegistration;
  const selected = events.find((e) => e.id === eventParam) ?? null;
  const loaded = selected ? await getFormOrDraft(selected.id) : null;
  const registrations = loaded?.saved ? await listRegistrations(loaded.form.id) : [];
  const names = loaded ? await playerNames(registrations.flatMap((r) => Object.values(divisionTeammates(loaded.form, r.answers)).flat())) : {};
  const activeTab: TabId = TABS.includes(tab as TabId) ? (tab as TabId) : 'form';
  const href = (id: TabId) => `/event-registration?event=${selected?.id}&tab=${id}`;
  const saveFirst = <p className="rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500">{tr.saveFormFirst}</p>;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t.tools.event_registration.label}</h1>
        {!selected && <p className="max-w-2xl text-sm text-gray-600">{tr.toolIntro}</p>}
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">{tr.noEvents}</p>
        ) : (
          <EventPicker
            selectedId={selected?.id ?? null}
            events={events.map((e) => ({
              id: e.id,
              name: e.name,
              startDate: e.startDate,
              endDate: e.endDate,
              isTest: e.isTest,
              upcoming: e.upcoming,
              hasForm: !!e.formId,
              isOpen: e.isOpen,
              registered: e.registered,
            }))}
          />
        )}
      </div>

      {loaded && (
        <div className="flex flex-col">
          <Tabs
            initialActive={activeTab}
            tabs={[
              { id: 'form', label: tr.tabForm, href: href('form'), content: <FormBuilder key={loaded.form.eventId} form={loaded.form} saved={loaded.saved} /> },
              { id: 'embed', label: tr.tabEmbed, href: href('embed'), content: loaded.saved ? <EmbedCode form={loaded.form} /> : saveFirst },
              {
                id: 'registrations',
                label: `${tr.tabRegistrations} (${registrations.length})`,
                href: href('registrations'),
                content: loaded.saved ? <RegistrationsTable form={loaded.form} registrations={registrations} names={names} /> : saveFirst,
              },
            ]}
          />
        </div>
      )}
    </main>
  );
}
