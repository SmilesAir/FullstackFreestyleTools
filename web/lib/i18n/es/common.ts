import type { Dictionary } from '../dictionaries';

// Glossary, so the same thing reads the same everywhere (tú form throughout):
//   pool → grupo · round → ronda · Finals/Semifinals/... → Final/Semifinal/Cuartos de final/Preliminares
//   head judge → juez principal · judge → juez · judging → jueceo · seat → puesto de juez
//   routine → rutina · place (1st, 2nd) → lugar · score → puntaje · note (a judge's tap) → nota
//   Difficulty → Dificultad · Artistic Impression → Impresión Artística · Execution → Ejecución
//   event → evento · division → división (names like "Open Pairs" stay as they are) · team → equipo
//   time call → aviso de tiempo · announcer → locutor · results → resultados
export const common: Dictionary['common'] = {
  intlLocale: 'es-419',
  siteName: 'Fullstack Freestyle Tools',
  siteDescription: 'Herramientas de datos para torneos de freestyle frisbee',
  save: 'Guardar',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  close: 'Cerrar',
  delete: 'Eliminar',
  edit: 'Editar',
  working: 'Procesando…',
  loading: 'Cargando…',
  back: 'Volver',
  test: 'Prueba',
  signOut: 'Cerrar sesión',
  logIn: 'Iniciar sesión',
  controlPanel: 'Panel de control',
  backToControlPanel: '← Panel de control',
  noPlayers: '(sin jugadores)',
  language: 'Idioma',
  pool: (letter) => `Grupo ${letter}`,
  pools: (letters) => `Grupos ${letters}`,
  roundName: (n) => ({ 1: 'Final', 2: 'Semifinal', 3: 'Cuartos de final', 4: 'Preliminares' })[n] ?? `Ronda ${n}`,
  allRounds: 'Todas las rondas',
  ordinal: (n) => `${n}.º`,
};
