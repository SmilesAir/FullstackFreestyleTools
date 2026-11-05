import type { Dictionary } from '../dictionaries';

export const eventEditor: Dictionary['eventEditor'] = {
  openEventCreator: 'Abrir Creador de eventos',
  openHeadJudge: 'Abrir Juez principal',
  openResultsParser: 'Abrir Analizador de resultados',
  selectEvent: 'Elige un evento para ver sus detalles.',
  summary: (players, divisions) => `${players} jugadores · ${divisions} divisiones`,
  noDivisions: 'Todavía no hay divisiones.',
  noRounds: 'Todavía no hay rondas.',
  eventName: 'Nombre del evento',
  filterPlaceholder: 'Filtrar eventos por nombre…',
  noMatch: 'Ningún evento coincide.',
  test: 'Prueba',
  hidden: 'Oculto',
  testHidden: 'Prueba·Oculto',
  testEvent: 'Evento de prueba',
  weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
};
