import type { Dictionary } from '../dictionaries';

export const supportChat: Dictionary['supportChat'] = {
  supportTitle: 'Soporte técnico',
  supportIntro:
    'Pregunta cómo hacer algo con estas herramientas o cómo dirigir tu evento. Por ejemplo: “¿Cómo publico los resultados de un grupo?” o “La pantalla de un juez no se actualiza.”',
  trainerTitle: 'Ayuda de Fpa2027',
  trainerIntro:
    'Pregunta cómo funcionan el jueceo y los puntajes de Fpa2027. Por ejemplo: “¿Cómo se calcula la base de Dificultad?” o “¿Qué hace +10% a mi puntaje?”',
  chat: (title) => `Chat de ${title}`,
  newChat: 'Nuevo chat',
  thinking: 'Pensando…',
  askPlaceholder: 'Haz una pregunta…',
  send: 'Enviar',
  disclaimer: 'Las respuestas son de Claude y pueden estar equivocadas. Los chats se guardan 90 días para que los administradores mejoren esta ayuda.',
  somethingWrong: 'Algo salió mal. Inténtalo de nuevo.',
  noAnswer: 'No llegó ninguna respuesta. Inténtalo de nuevo.',
  couldntReachServer: 'No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.',

  signIn: 'Inicia sesión para usar el chat de soporte.',
  couldNotSend: 'No se pudo enviar ese mensaje.',
  noAccess: 'No tienes acceso al chat de soporte.',
  tooLong: (max) => `Escribe una pregunta de menos de ${max} caracteres.`,
  notSetUp: 'El chat de soporte todavía no está configurado.',
  lookingUpResults: '(Buscando los resultados…)\n\n',
  lookingUpPools: '(Buscando los grupos…)\n\n',
  keyRejected: 'La clave de API de Anthropic guardada fue rechazada. Pídele a un administrador que la actualice en Configuración.',
  busy: 'Claude está ocupado ahora mismo. Inténtalo de nuevo en un minuto.',
  outOfCredit: 'La cuenta de Anthropic se quedó sin crédito. Pídele a un administrador que la recargue en Plans & Billing de la consola de Anthropic.',
  apiError: (status) => `Claude no pudo responder (error ${status}). Inténtalo de nuevo en un rato.`,
  couldntReachClaude: 'No se pudo conectar con Claude. Revisa la conexión a internet e inténtalo de nuevo.',
  noKey: 'El chat de soporte todavía no está configurado: un administrador tiene que agregar la clave de API de Anthropic en Configuración.',
  turnedOff: 'El chat de soporte está desactivado. Un administrador puede activarlo en Configuración.',
  noTable: 'El chat de soporte todavía no está configurado en esta base de datos.',
  budgetUsed: 'El chat de soporte usó el presupuesto de este mes. Vuelve a funcionar el mes que viene, o un administrador puede subir el presupuesto en Configuración.',
  dayFull: (wait) => `El chat de soporte ya respondió todas las preguntas que puede hoy. Inténtalo de nuevo en ${wait}.`,
  userDay: (n, wait) => `Hiciste ${n} preguntas en el último día. Inténtalo de nuevo en ${wait}.`,
  userHour: (n, wait) => `Hiciste ${n} preguntas en la última hora. Inténtalo de nuevo en ${wait}.`,
  aboutMinutes: (n) => `unos ${n} minuto${n === 1 ? '' : 's'}`,
  aboutHours: (n) => `unas ${n} horas`,
  replyIn:
    'The person asking reads Latin American Spanish: always reply in Latin American Spanish (tú form), whatever language the guide or the question is in. Keep the names of buttons, tabs and tools as they appear on their screen in Spanish.',
};
