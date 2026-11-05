import type { Dictionary } from '../dictionaries';

export const tools: Dictionary['tools'] = {
  player_editor: {
    label: 'Editor de jugadores',
    description:
      'Busca, crea y edita fichas de jugadores; ocúltalas en vez de borrarlas; vincula entradas duplicadas con el selector de alias.',
  },
  data_bridge: {
    label: 'Puente de datos',
    description:
      'Mantén los eventos sincronizados con la tabla DynamoDB de la app en vivo: interruptor por evento, ejecución manual o de prueba y resolución de conflictos.',
  },
  event_creator: {
    label: 'Creador de eventos',
    description:
      'Crea eventos, arma divisiones/rondas/grupos, pega los equipos (Claude los interpreta) y siembra las rondas según los rankings.',
  },
  event_editor: {
    label: 'Editor de eventos',
    description:
      'Recorre todos los eventos en un calendario mensual, mira sus divisiones/rondas/grupos/equipos, márcalos como prueba u ocultos y salta al Analizador de resultados, al Creador de eventos o a Juez principal.',
  },
  head_judge: {
    label: 'Juez principal',
    description: 'Dirige un día de evento: mira cada grupo con sus equipos y jueces, elige el grupo que juega y sigue los resultados.',
  },
  event_music: {
    label: 'Música del evento',
    description:
      'Pon la canción de cada equipo en un evento: grupos con cuántas canciones faltan, la canción de cada equipo para probarla, un reproductor que siempre tiene al equipo que sigue y sus avisos de tiempo.',
  },
  pool_review: {
    label: 'Revisión de grupos',
    description:
      'Revisa los grupos antes de que se jueguen: los equipos de cada grupo sin publicar en orden de juego y sus jueces. Los directores de una división lo ven sin que se les dé esta herramienta, y el comité de un evento ve todas sus divisiones.',
  },
  rankings_generator: {
    label: 'Generador de rankings',
    description:
      'Elige eventos, ajusta la configuración de rankings y ratings, previsualízalos y publícalos para las páginas públicas de resultados.',
  },
  results_parser: {
    label: 'Analizador de resultados',
    description:
      'Carga los resultados de eventos hechos fuera de este sistema: pégalos para que Claude los complete, revisa rondas, grupos, puestos y jugadores, y guarda.',
  },
  permissions: {
    label: 'Editor de permisos',
    description: 'Crea cuentas de usuario, activa o quita el acceso de administrador y gestiona los grupos de permisos.',
  },
  settings: {
    label: 'Configuración',
    description: 'Configura ajustes de toda la app, incluido el token del bot de Discord.',
  },
  backups: {
    label: 'Respaldos',
    description: 'Crea, descarga, sube y restaura respaldos completos de la base de datos.',
  },
  public_api: {
    label: 'API pública',
    description: 'Cada endpoint público de solo lectura con lo que devuelve, más sus límites de uso.',
  },
  profile: {
    label: 'Perfil',
    description: 'Mira los datos de tu cuenta y elige tu idioma.',
  },
  activity: {
    label: 'Actividad del jugador',
    description:
      'Cada grupo en el que jugaste o juzgaste, del más reciente al más antiguo: los resultados una vez jugado, y antes el orden de juego (y los jueces, cuando juzgas).',
  },
  judging_trainer: {
    label: 'Entrenador de jueceo',
    description:
      'Practica el jueceo Fpa2027 con un grupo de prueba de 8 equipos: haz de cada juez y del juez principal, y luego mira cómo se calculan los puntajes y puestos. Todo queda en tu navegador.',
  },
};
