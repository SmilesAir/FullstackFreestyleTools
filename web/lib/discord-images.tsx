import 'server-only';
import { ImageResponse } from 'next/og';

// The PNG tables the bot attaches to its Discord posts, drawn with next/og
// (Satori: every element with several children needs display: flex). Bundled
// font: Geist Regular, which has the accented letters players' names use.

const WIDTH = 1000;
const PAD = 32;
const TITLE_H = 64;
const ROW_H = 40;
const COLORS = { bg: '#ffffff', text: '#111827', muted: '#6b7280', line: '#e5e7eb', head: '#f3f4f6', accent: '#2563eb' };

// A few pixels past the rows, so the table's bottom border isn't cut off.
async function png(element: React.ReactElement, height: number): Promise<ArrayBuffer> {
  return new ImageResponse(element, { width: WIDTH, height: Math.ceil(height) + 6 }).arrayBuffer();
}

function Frame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: COLORS.bg, padding: PAD, color: COLORS.text }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: TITLE_H }}>
        <div style={{ display: 'flex', fontSize: 30 }}>{title}</div>
        <div style={{ display: 'flex', fontSize: 18, color: COLORS.muted }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

// A pool's teams in play order and its judges (category label and name).
export type PlayOrderPool = { letter: string; teams: string[]; judges: { category: string; name: string }[] };

// Rows a pool's column takes: its teams, then (if any) a Judges heading and a row per judge.
const poolRows = (p: PlayOrderPool) => p.teams.length + (p.judges.length > 0 ? 1 + p.judges.length : 0);

// One column per pool, each listing its teams in play order, then its judges.
export async function playOrderImage(title: string, subtitle: string, pools: PlayOrderPool[]): Promise<ArrayBuffer> {
  const rows = Math.max(1, ...pools.map(poolRows));
  const height = PAD * 2 + TITLE_H + 16 + ROW_H * (rows + 1);
  const colWidth = (WIDTH - PAD * 2 - 16 * (pools.length - 1)) / Math.max(1, pools.length);
  // Several pools side by side need a smaller font to fit a team on one line.
  const fontSize = pools.length >= 3 ? 16 : 20;
  return png(
    <Frame title={title} subtitle={subtitle}>
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {pools.map((pool) => (
          <div key={pool.letter} style={{ display: 'flex', flexDirection: 'column', width: colWidth, border: `1px solid ${COLORS.line}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', height: ROW_H, alignItems: 'center', padding: '0 12px', background: COLORS.head, fontSize: 20, color: COLORS.accent }}>
              {`Pool ${pool.letter}`}
            </div>
            {pool.teams.map((team, i) => (
              <div key={i} style={{ display: 'flex', height: ROW_H, alignItems: 'center', padding: '0 12px', borderTop: `1px solid ${COLORS.line}`, fontSize }}>
                <span style={{ color: COLORS.muted, width: 32 }}>{`${i + 1}.`}</span>
                <span>{team}</span>
              </div>
            ))}
            {pool.judges.length > 0 && (
              <div style={{ display: 'flex', height: ROW_H, alignItems: 'center', padding: '0 12px', borderTop: `1px solid ${COLORS.line}`, background: COLORS.head, fontSize: 18, color: COLORS.muted }}>
                Judges
              </div>
            )}
            {pool.judges.map((judge, i) => (
              <div key={`j${i}`} style={{ display: 'flex', height: ROW_H, alignItems: 'center', padding: '0 12px', borderTop: `1px solid ${COLORS.line}`, fontSize }}>
                <span style={{ color: COLORS.muted, width: pools.length >= 3 ? 90 : 110, fontSize: fontSize - 4 }}>{judge.category}</span>
                <span>{judge.name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Frame>,
    height
  );
}

// Rough rendered width of text in Geist, erring wide so a line we build never
// wraps again inside Satori (which would overflow the row's fixed height).
function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (/[iljtfrI.,:;'|!() ]/.test(ch)) em += 0.32;
    else if (/[mwMW]/.test(ch)) em += 0.85;
    else if (/[A-Z]/.test(ch)) em += 0.68;
    else em += 0.58;
  }
  return em * fontSize;
}

// Greedy word wrap into lines no wider than maxWidth (a single long word stays whole).
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, fontSize) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

export type ResultsRow = { place: number | null; team: string; cells: (number | null)[]; total: number | null };

// Place · Team · each extra column (category totals) · Total, best first.
// Long team names wrap onto several lines and their row grows to fit.
export async function resultsImage(title: string, subtitle: string, columns: string[], rows: ResultsRow[], totalLabel = 'Total'): Promise<ArrayBuffer> {
  const numberCol = 120;
  const placeCol = 80;
  const fontSize = 20;
  const lineH = 26;
  const teamCol = WIDTH - PAD * 2 - 2 - 24 - placeCol - numberCol * (columns.length + 1) - 8;
  const rowHeight = (lines: number) => Math.max(ROW_H, lines * lineH + 14);
  const teamLines = rows.map((r) => wrapText(r.team, teamCol, fontSize));
  const height = PAD * 2 + TITLE_H + 16 + ROW_H + teamLines.reduce((sum, lines) => sum + rowHeight(lines.length), 0);
  const cell = (v: number | null) => (v === null ? '—' : String(v));
  const Row = ({ place, team, cells, total, head }: { place: string; team: string[]; cells: string[]; total: string; head?: boolean }) => (
    <div
      style={{
        display: 'flex',
        height: rowHeight(team.length),
        alignItems: 'center',
        fontSize,
        borderTop: head ? 'none' : `1px solid ${COLORS.line}`,
        background: head ? COLORS.head : COLORS.bg,
        color: head ? COLORS.muted : COLORS.text,
        padding: '0 12px',
      }}
    >
      <span style={{ width: placeCol, color: head ? COLORS.muted : COLORS.accent }}>{place}</span>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 8 }}>
        {team.map((line, i) => (
          <span key={i} style={{ height: lineH, lineHeight: `${lineH}px`, whiteSpace: 'nowrap' }}>
            {line}
          </span>
        ))}
      </div>
      {cells.map((c, i) => (
        <span key={i} style={{ width: numberCol, justifyContent: 'flex-end', display: 'flex', whiteSpace: 'nowrap' }}>
          {c}
        </span>
      ))}
      <span style={{ width: numberCol, justifyContent: 'flex-end', display: 'flex', whiteSpace: 'nowrap' }}>{total}</span>
    </div>
  );
  return png(
    <Frame title={title} subtitle={subtitle}>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16, border: `1px solid ${COLORS.line}`, borderRadius: 8 }}>
        <Row head place="Place" team={['Team']} cells={columns} total={totalLabel} />
        {rows.map((r, i) => (
          <Row key={i} place={cell(r.place)} team={teamLines[i]} cells={r.cells.map(cell)} total={cell(r.total)} />
        ))}
      </div>
    </Frame>,
    height
  );
}
