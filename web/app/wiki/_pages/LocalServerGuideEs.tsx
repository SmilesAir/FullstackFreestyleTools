import Link from 'next/link';
import { Bullets, Code, Commands, Contents, Note, Numbered, Page, Section, Shot, Step, Table, link } from './parts';

// The English one is LocalServerGuide.tsx; keep the two in step. Button names are as the
// Spanish screens show them (lib/i18n/es).
export function LocalServerGuideEs() {
  return (
    <Page
      title="Usar el sistema en local"
      intro={
        <>
          <p>
            Muchas sedes tienen internet débil o nada. El sistema puede correr en una laptop: la laptop ejecuta la app
            con su propia base de datos, y los teléfonos de los jueces se conectan a ella por un hotspot compartido,
            así el jueceo nunca depende de internet. Cuando la laptop tiene internet, se sincroniza con el sitio
            principal en segundo plano.
          </p>
          <p className="mt-2">
            Todo lo demás funciona como en{' '}
            <Link href="/wiki/head-judge" className={link}>
              Organizar un evento como juez principal
            </Link>
            ; esta página cubre solo lo que cambia.
          </p>
        </>
      }
    >
      <Contents
        label="En esta página"
        items={[
          { id: 'need', title: 'Qué necesitas' },
          { id: 'setup', title: 'Preparación única de la laptop' },
          { id: 'event', title: 'En el evento' },
          { id: 'where', title: 'Qué pasa dónde' },
          { id: 'trouble', title: 'Si un teléfono no llega a la laptop' },
          { id: 'backups', title: 'Respaldos y empezar de cero' },
          { id: 'dev', title: 'Para desarrolladores' },
        ]}
      />

      <Section id="need" title="Qué necesitas">
        <Bullets>
          <li>Una laptop (estos pasos son para Windows) que quede enchufada durante el evento.</li>
          <li>
            Un hotspot Wi-Fi o router al que se conecten la laptop y todos los dispositivos de los jueces. Sirve el
            hotspot de un teléfono. No necesita internet, pero con internet los resultados llegan al sitio principal
            durante el evento.
          </li>
          <li>
            Una cuenta con inicio de sesión por <strong>correo y contraseña</strong> y acceso a Juez principal. Discord
            necesita internet, así que no sirve en la laptop. Pídesela a un administrador si no la tienes.
          </li>
          <li>
            El archivo de configuración de la app, <Code>web/.env.local</Code>, que te da el dueño del proyecto. Tiene
            las contraseñas que usa la laptop para sincronizarse con el sitio principal: mantenlo en privado y nunca lo
            compartas.
          </li>
        </Bullets>
      </Section>

      <Section id="setup" title="Preparación única de la laptop">
        <p>Hazlo en casa con buen internet, unos días antes del evento.</p>
        <Step title="1. Instala Postgres">
          <p>
            Descárgalo de{' '}
            <a href="https://www.postgresql.org/download/" className={link}>
              postgresql.org/download
            </a>{' '}
            (en Windows, el instalador de EDB). Deja el puerto 5432 por defecto y recuerda la contraseña de{' '}
            <Code>postgres</Code> que elijas. No hace falta crear una base de datos: la app lo hace.
          </p>
        </Step>
        <Step title="2. Instala Node.js y Git">
          <p>
            Instala la versión LTS de{' '}
            <a href="https://nodejs.org" className={link}>
              Node.js
            </a>{' '}
            y{' '}
            <a href="https://git-scm.com" className={link}>
              Git
            </a>
            .
          </p>
        </Step>
        <Step title="3. Descarga la app y compílala">
          <p>
            Abre una terminal y ejecuta esto. Pon el archivo <Code>.env.local</Code> en la carpeta <Code>web</Code>{' '}
            antes de compilar.
          </p>
          <Commands
            lines={[
              'git clone https://github.com/SmilesAir/FullstackFreestyleTools.git',
              'cd FullstackFreestyleTools/web',
              'npm install',
              'npm run build',
              'npm run start:local',
            ]}
          />
          <p>
            <Code>npm run start:local</Code> inicia la app y muestra las direcciones que abrirán los jueces. Deja la
            terminal abierta mientras la app corre; si la cierras, la app se detiene.
          </p>
        </Step>
        <Step title="4. Crea la base de datos local desde la página">
          <Numbered>
            <li>
              En la propia laptop, abre <Code>http://localhost:3000</Code> (no su dirección de red) e inicia sesión con
              tu correo y contraseña.
            </li>
            <li>
              Abre <strong>Juez principal</strong> y haz clic en el indicador de base de datos de arriba (dice{' '}
              <strong>Postgres (Neon)</strong>).
            </li>
            <li>
              En <strong>Base de datos local</strong>, abre{' '}
              <strong>Crear la base de datos y un usuario por mí</strong>, escribe la contraseña de administrador de
              Postgres del paso 1 y haz clic en <strong>Crear base de datos y usuario</strong>.
            </li>
          </Numbered>
          <p>
            Eso crea la base de datos y sus tablas, y guarda su dirección en la laptop. La contraseña de administrador se
            usa una sola vez y nunca se guarda. Hacerlo de nuevo no causa problemas.
          </p>
          <Shot
            name="db-create"
            lang="es"
            alt="El panel de base de datos en una laptop nueva: Crear la base de datos y un usuario por mí, con el campo de la contraseña de administrador"
          />
        </Step>
        <Note>
          Antes de cada evento, consigue la versión más nueva de la app: en la carpeta <Code>web</Code> ejecuta{' '}
          <Code>git pull</Code>, <Code>npm install</Code> y <Code>npm run build</Code>, y luego{' '}
          <Code>npm run start:local</Code>.
        </Note>
      </Section>

      <Section id="event" title="En el evento">
        <Step title="1. Prepara el evento primero en el sitio principal">
          <p>
            Prepara las divisiones, grupos, equipos y jueces en el Creador de eventos como siempre (en el sitio
            principal, o en la laptop mientras tiene internet). Cualquier cambio posterior también se hace allí y se
            descarga a la laptop.
          </p>
        </Step>
        <Step title="2. Inicia la laptop">
          <p>
            Conecta la laptop al hotspot y ejecuta <Code>npm run start:local</Code> en la carpeta <Code>web</Code>.
            Abre <Code>http://localhost:3000</Code>, inicia sesión y abre Juez principal.
          </p>
        </Step>
        <Step title="3. Lleva el evento sin conexión y cambia al servidor local">
          <Numbered>
            <li>Haz clic en el indicador de base de datos y elige el evento.</li>
            <li>
              Haz clic en <strong>Llevar el evento sin conexión (descargarlo)</strong>. Esto necesita internet.
            </li>
            <li>
              Cambia a <strong>Servidor local</strong>. Todas las pantallas cambian a la vez, así que hazlo entre
              rutinas.
            </li>
          </Numbered>
          <Shot
            name="db-offline"
            lang="es"
            alt="El panel de base de datos con el evento elegido en Evento en el servidor local, y Llevar el evento sin conexión"
          />
        </Step>
        <Step title="4. Conecta a los jueces">
          <p>
            Cada juez se conecta al mismo hotspot y escanea el <strong>código QR</strong> del indicador de base de datos
            (o escribe la dirección que aparece allí, como <Code>http://192.168.1.20:3000</Code>). Desde ahí es igual
            que el Paso 4 de la guía del juez principal: no iniciar sesión, presionar su propio botón e ingresar el PIN
            de jueces.
          </p>
          <Shot
            name="db-local"
            lang="es"
            alt="El panel de base de datos en el servidor local: Servidor local en uso, el estado de la sincronización, y el código QR y las direcciones que abren los jueces"
          />
        </Step>
        <Step title="5. Dirige el evento como siempre">
          <p>
            Juez principal funciona igual. En el servidor local, las pantallas del juez principal y de los jueces se
            actualizan cada segundo.
          </p>
        </Step>
        <Step title="6. Termina">
          <p>
            Antes de apagar la laptop, conéctala a internet y vuelve a poner el indicador en{' '}
            <strong>Postgres (Neon)</strong>. Eso envía todo primero. Revisa que el indicador diga que no queda nada por
            enviar.
          </p>
        </Step>
      </Section>

      <Section id="where" title="Qué pasa dónde">
        <Table
          head={['Qué', 'Dónde pasa']}
          rows={[
            [
              'Preparación del evento (divisiones, grupos, equipos, jueces, jugadores)',
              'Se edita en el sitio principal y se descarga a la laptop cuando cambia.',
            ],
            [
              'Jueceo (rutinas, notas, puntajes, resultados, estado del juego)',
              <>
                Se crea en la laptop y se envía al sitio principal cada 30 segundos cuando hay internet.{' '}
                <strong>Sincronizar ahora</strong> en el indicador lo envía de inmediato.
              </>,
            ],
            [
              'Quién sigue y el cronómetro de la rutina',
              'Se envía al sitio principal de inmediato, así las pantallas de allí van al día en pocos segundos.',
            ],
            [
              'Música del evento y la página del locutor',
              'Úsalas en el sitio principal (las canciones necesitan internet). Siguen al equipo que está jugando.',
            ],
            [
              'Enlaces públicos de resultados',
              'Los sirve el sitio principal, así que muestran los resultados una vez que la laptop se sincronizó.',
            ],
            ['Inicio de sesión', 'Correo y contraseña en la laptop. Discord necesita internet.'],
          ]}
        />
        <Note>
          Consigue el enlace del locutor (<strong>Copiar enlace del locutor</strong>) mientras la laptop tiene
          internet. Después el enlace sigue funcionando.
        </Note>
      </Section>

      <Section id="trouble" title="Si un teléfono no llega a la laptop">
        <Bullets>
          <li>
            Permite la app en el Firewall de Windows para la red del hotspot. Windows puede clasificarla como Pública.
          </li>
          <li>Asegúrate de que el hotspot no aísle los dispositivos entre sí (aislamiento de clientes o AP apagado).</li>
          <li>
            Usa la dirección que muestra el indicador. El nombre <Code>.local</Code> es un respaldo para cuando cambia
            la dirección IP.
          </li>
          <li>
            Si la página carga en el teléfono pero nunca se actualiza y nada se puede presionar, la app se inició con{' '}
            <Code>npm run dev</Code>. Detenla y usa <Code>npm run build</Code> y luego <Code>npm run start:local</Code>.
          </li>
        </Bullets>
      </Section>

      <Section id="backups" title="Respaldos y empezar de cero">
        <Step title="Respaldos de seguridad">
          <p>
            La laptop respalda su base de datos antes de reemplazar algo en ella (se guardan los 20 más recientes en{' '}
            <Code>web/.local/backups</Code>). Para restaurar uno, detén la app y luego:
          </p>
          <Commands
            lines={['npm run local:restore              # lista los respaldos', 'npm run local:restore -- <nombre del archivo>']}
          />
        </Step>
        <Step title="Empezar de cero con una laptop limpia">
          <Numbered>
            <li>
              Pon el indicador en <strong>Postgres (Neon)</strong> (esto envía lo que falte), y luego detén la app.
            </li>
            <li>
              Borra la base de datos y su usuario en Postgres, por ejemplo en <Code>psql -U postgres</Code>:{' '}
              <Code>DROP DATABASE freestyle_local WITH (FORCE); DROP ROLE freestyle;</Code>
            </li>
            <li>
              Borra la carpeta <Code>web/.local</Code>.
            </li>
            <li>Inicia la app y repite el paso 4 de la preparación única.</li>
          </Numbered>
          <p>Nada del sitio principal se toca con esto.</p>
        </Step>
      </Section>

      <Section id="dev" title="Para desarrolladores">
        <p>
          Para trabajar en la app, ejecuta <Code>npm run dev</Code> en la carpeta <Code>web</Code> y abre{' '}
          <Code>http://localhost:3000</Code>. Usa la base de datos indicada en <Code>.env.local</Code> hasta que el
          indicador se cambie al servidor local. Usa <Code>npm run start:local</Code> en los eventos, porque{' '}
          <Code>npm run dev</Code> puede bloquear a otros dispositivos. El README tiene los detalles técnicos.
        </p>
      </Section>
    </Page>
  );
}
