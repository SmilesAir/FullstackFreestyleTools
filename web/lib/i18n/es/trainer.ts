import type { Dictionary } from '../dictionaries';

export const trainer: Dictionary['trainer'] = {
  views: {
    guide: 'Guía de inicio',
    Diff: 'Juez Diff',
    AI: 'Juez AI',
    Ex: 'Juez Ex',
    results: 'Resultados',
    description: 'Descripción FPA2027',
  },
  title: 'Entrenador de jueceo',
  newTestEvent: 'Nuevo evento de prueba',
  screen: 'Pantalla',
  endEarlyTip: 'Detener la rutina ahora para que el juez pueda ingresar el puntaje',
  endEarly: 'Terminar antes',
  status: (team, judge, time, length, over) =>
    `Equipo ${team}${judge ? ` · ${judge}` : ''} · ${time} / ${length}${over ? ' · ingresa el puntaje' : ''}`,
  noRoutine: 'No hay ninguna rutina en curso. Inicia una desde Resultados.',
  newEventConfirm: '¿Empezar un nuevo evento de prueba? Se borran todas las notas y puntajes.',
  badge: 'Entrenador',
  judging: 'Juzgando…',
  enterScore: 'Ingresar puntaje',
  runningTip: 'Hay una rutina en curso. Espera a que termine, o termínala antes.',
  start: 'Iniciar',
  resultsHelp: 'Presiona Iniciar debajo de un juez para jugar la rutina de ese equipo para ese juez, y luego júzgala en su pantalla.',
};
