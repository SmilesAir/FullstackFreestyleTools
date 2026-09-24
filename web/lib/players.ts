export type Player = {
  id: string;
  first_name: string;
  last_name: string;
  alias_id: string | null;
  gender: string | null;
  country: string | null;
  fpa_website_id: string | null;
  membership: number | null;
  created_at: string;
  last_active: string;
  hidden: boolean;
};

export type PlayerWithAliasName = Player & {
  alias_first_name: string | null;
  alias_last_name: string | null;
};

export function normalizeGender(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  return upper === 'M' || upper === 'F' || upper === 'X' ? upper : null;
}
