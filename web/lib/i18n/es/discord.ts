import type { Dictionary } from '../dictionaries';

export const discord: Dictionary['discord'] = {
  testDm: 'Este es un mensaje de prueba de Fullstack Freestyle Tools: si te llegó, ¡las notificaciones de Discord funcionan!',
  testDmLinkedPlayer: 'Jugador vinculado:',
  testDmNoPlayer: '(Todavía no hay un jugador vinculado: puedes vincular uno en tu página de perfil.)',
  reviewReady: (eventName, title) => `**${eventName}: ${title}** está listo para revisar.`,
  reviewCheck: (pools) => `${pools}: revisa el orden de juego de los equipos y los jueces antes de que se juegue la ronda.`,
  couldNotReach: 'No se pudo conectar con Discord.',
};
