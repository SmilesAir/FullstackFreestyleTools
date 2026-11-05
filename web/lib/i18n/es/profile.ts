import type { Dictionary } from '../dictionaries';

export const profile: Dictionary['profile'] = {
  title: 'Perfil',
  username: (email) => `Usuario: ${email}`,
  linkedPlayer: 'Jugador vinculado',
  discordId: 'ID de Discord',
  signInMethods: 'Formas de iniciar sesión',
  languageHelp: 'El idioma en que se muestra el sitio, en todos los dispositivos donde inicies sesión.',
  discordHelpBefore:
    'En Discord: Ajustes de usuario → Avanzado → activa el Modo desarrollador. Luego haz clic derecho en tu nombre de usuario en cualquier lugar y elige',
  discordHelpCopy: 'Copiar ID de usuario',
  discordPlaceholder: 'ID de usuario de Discord',
  searchName: 'Busca tu nombre…',
  sending: 'Enviando…',
  sendTestDm: 'Enviar DM de prueba',
  testDmSent: '¡Enviado! Revisa tus mensajes directos de Discord.',
  unlink: 'Desvincular',
  unlinkConfirm: '¿Desvincular este jugador de tu cuenta?',
  connectHelp:
    'Conecta tus formas de iniciar sesión a esta cuenta para que cualquiera de ellas la abra, aunque usen correos distintos.',
  connectDone: 'Inicio de sesión conectado.',
  connectTaken:
    'Ese inicio de sesión ya abre otra cuenta, así que no se conectó. Pídele a un administrador que una las dos cuentas.',
  emailPassword: 'Correo y contraseña',
  set: 'configurada',
  notSet: 'sin configurar',
  connected: 'conectado',
  onlyWay: 'Es tu única forma de iniciar sesión',
  disconnectConfirm: (provider) => `¿Desconectar ${provider} de esta cuenta?`,
  disconnect: 'Desconectar',
  connect: 'Conectar',
  pickPlayer: 'Elige un jugador para vincular',
  playerTaken: 'Ese jugador ya está vinculado a otra cuenta.',
  linkFailed: 'No se pudo vincular el jugador',
  unknownSignIn: 'Inicio de sesión desconocido',
  badDiscordId:
    'Eso no parece un ID de usuario de Discord: debe ser un número (activa el Modo desarrollador en Discord y haz clic derecho en tu nombre → Copiar ID de usuario).',
  setDiscordFirst: 'Primero configura tu ID de Discord.',
};
