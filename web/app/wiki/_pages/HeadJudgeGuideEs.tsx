import Link from 'next/link';
import { Bullets, Contents, Note, Numbered, Page, Section, Shot, Step, link } from './parts';

// The English one is HeadJudgeGuide.tsx; keep the two in step. Button names are as the
// Spanish screens show them (lib/i18n/es).
export function HeadJudgeGuideEs() {
  return (
    <Page
      title="Organizar un evento como juez principal"
      intro={
        <p>
          Cómo organizar un evento con estas herramientas, desde conseguir acceso hasta compartir los resultados. El
          sitio es{' '}
          <a href="https://freestylejudge.com/new" className={link}>
            freestylejudge.com/new
          </a>
          . Si el internet de la sede es débil, lee también{' '}
          <Link href="/wiki/local-server" className={link}>
            Usar el sistema en local
          </Link>
          .
        </p>
      }
    >
      <Contents
        label="En esta página"
        items={[
          { id: 'permissions', title: 'Paso 1: Conseguir permisos' },
          { id: 'setup', title: 'Paso 2: Preparar el evento' },
          { id: 'run', title: 'Paso 3: Dirigir el evento' },
          { id: 'judges', title: 'Paso 4: Preparar a los jueces' },
          { id: 'results', title: 'Paso 5: Obtener los resultados' },
          { id: 'help', title: 'Práctica y ayuda' },
        ]}
      />

      <Section id="permissions" title="Paso 1: Conseguir permisos">
        <Step title="Crea una cuenta">
          <p>
            Ve a{' '}
            <a href="https://freestylejudge.com/new" className={link}>
              freestylejudge.com/new
            </a>
            , haz clic en <strong>Iniciar sesión</strong> y entra con Discord. La primera vez que entras se crea tu
            cuenta.
          </p>
          <p>
            Luego abre <strong>Perfil</strong> en el Panel de control y vincula tu jugador, para que tu cuenta sepa qué
            jugador eres.
          </p>
        </Step>
        <Step title="Pide acceso al Creador de eventos y al Juez principal">
          <p>
            Escribe a Ryan Young a <strong>ryan@smilesair.com</strong> y pide acceso al Creador de eventos y al Juez
            principal. Cuando te lo den, el <strong>Panel de control</strong> mostrará esas herramientas.
          </p>
          <Shot name="control-panel" lang="es" alt="El Panel de control, con una tarjeta por cada herramienta que la cuenta puede usar" />
          <p>
            Si vas a dirigir el evento en una laptop sin internet, pide también un inicio de sesión con correo y
            contraseña (Discord necesita internet). Perfil muestra si tu cuenta tiene uno.
          </p>
        </Step>
        <Note tone="warn">
          <strong>Por favor, sé responsable y modifica solo tus propios eventos.</strong>
        </Note>
      </Section>

      <Section id="setup" title="Paso 2: Preparar el evento">
        <p>
          Todo esto se hace en el <strong>Creador de eventos</strong> (Panel de control → Creador de eventos).
        </p>
        <Step title="Crea el evento">
          <p>
            En la pestaña <strong>Eventos</strong>, en <strong>Nuevo evento</strong>, escribe el nombre y las fechas del
            evento y haz clic en <strong>Crear evento</strong>. Luego elígelo de la lista de eventos.
          </p>
          <Shot name="ec-new-event" lang="es" alt="El formulario Nuevo evento: nombre, fechas de inicio y fin, y Crear evento" />
        </Step>
        <Step title="Agrega las divisiones">
          <p>
            Un evento empieza sin divisiones. Abre la pestaña <strong>+ Nueva división</strong>, elige el tipo de
            división (Open Pairs, Mixed Pairs, Open Co-op, Women Pairs, etc.) y haz clic en{' '}
            <strong>Crear división</strong>. Cada división tiene luego su propia pestaña.
          </p>
          <Shot name="ec-new-division" lang="es" alt="La pestaña + Nueva división con el menú Tipo de división y Crear división" />
        </Step>
        <Step title="Define las reglas de jueceo">
          <p>En la pestaña de cada división, define la duración de la rutina (3, 4 o 5 minutos) y las reglas:</p>
          <Bullets>
            <li>
              <strong>Fpa2027</strong>: el sistema de jueceo completo, con jueces de Dificultad, Ejecución e Impresión
              artística. Se suman los puntajes de todos los jueces y gana el equipo con más puntos.
            </li>
            <li>
              <strong>Simple Ranking</strong>: sin jueces asignados. Cualquiera ordena los equipos del mejor al peor en
              su teléfono. El mejor equipo recibe 1 punto, el siguiente 2, y así; gana el equipo con menos puntos.
            </li>
          </Bullets>
          <p>
            Haz clic en <strong>Guardar ajustes</strong>. Cambiar solo el menú no lo guarda. Una división antigua puede
            mostrar Fpa2020 (el sistema anterior): sus jueces nunca aparecen en la página de jueceo, así que cámbiala a
            Fpa2027.
          </p>
          <Shot name="ec-division-settings" lang="es" alt="Ajustes de la división: tipo, duración de la rutina, reglas y Guardar ajustes" />
        </Step>
        <Step title="Agrega equipos a las divisiones">
          <Bullets>
            <li>
              <strong>Una división</strong>: en la sección Agregar equipos de la división, pega los equipos en
              cualquier formato (un equipo por línea, una hoja de cálculo copiada…) y haz clic en{' '}
              <strong>Interpretar con Claude</strong>.
            </li>
            <li>
              <strong>Varias divisiones a la vez</strong>: en el evento, usa{' '}
              <strong>Agregar equipos a varias divisiones con Claude</strong> (por ejemplo, una hoja de cálculo con
              una fila de título por división). Las divisiones que el evento aún no tiene se crean.
            </li>
            <li>
              <strong>Desde la inscripción</strong>:{' '}
              <strong>Agregar jugadores y equipos desde la inscripción</strong> arma los equipos con las inscripciones
              de Inscripción al Evento. Marca Solo inscripciones pagadas para dejar fuera las no pagadas.
            </li>
          </Bullets>
          <p>
            Cada nombre se empareja con un jugador. Revisa la lista: <em>Coincide</em>, <em>Revisar</em> (elige el
            jugador correcto) o <em>¿Jugador nuevo?</em> (créalo). Un equipo con un jugador sin resolver se omite.
          </p>
          <Shot name="ec-add-teams" lang="es" alt="El cuadro Agregar equipos con tres equipos pegados e Interpretar con Claude" />
        </Step>
        <Step title="Agrega rondas y equipos a los grupos">
          <p>
            Cada división tiene rondas (Preliminares, Cuartos de final, Semifinal, Final). En una ronda, elige cuántos
            grupos tiene y haz clic en <strong>Guardar</strong>.
          </p>
          <p>
            Para la primera ronda, <strong>Sembrar según rankings</strong> llena los grupos según los rankings
            actuales, en orden de siembra. También puedes arrastrar equipos de la lista de Equipos a un grupo, y
            moverlos dentro de un grupo o entre grupos. El orden dentro de un grupo es el orden de juego que todos
            siguen.
          </p>
          <p>
            Para una ronda posterior, indica <strong>Equipos por grupo</strong> y haz clic en{' '}
            <strong>Llenar según resultados</strong> cuando todos los grupos de la ronda anterior tengan sus resultados.
            Primero entran los equipos que pasaron directo y luego los que avanzaron, por puesto (todos los 1.º, luego
            todos los 2.º, etc.).
          </p>
        </Step>
        <Step title="Agrega jueces a cada grupo">
          <p>
            Haz clic en <strong>Asignar jueces</strong> debajo de un grupo. Se abre una lista de jugadores abajo de la
            pantalla: arrastra a cada juez a la columna de su categoría (Diff, AI, Ex). Los grupos de Simple Ranking no
            tienen jueces.
          </p>
          <Shot
            name="ec-round"
            lang="es"
            alt="Una ronda Semifinal con dos grupos: los equipos de cada grupo en orden de juego y sus jueces en columnas Diff, AI y Ex"
          />
        </Step>
        <Step title="Opcional">
          <Bullets>
            <li>
              <strong>Enviar para revisar</strong> en una ronda pide a los directores de la división y al comité del
              evento que revisen sus grupos en Revisión de grupos (por mensaje de Discord).
            </li>
            <li>Define el canal de Discord del evento para que se publiquen allí los órdenes de juego y los resultados.</li>
          </Bullets>
        </Step>
        <Step title="Activa En juego cuando empiece el jueceo">
          <p>
            En la pestaña <strong>Eventos</strong>, activa el interruptor <strong>En juego</strong> en la fila del evento,
            en Eventos recientes. Solo los eventos en juego muestran a sus jueces en la página de jueceo.
          </p>
          <Shot name="ec-playing" lang="es" alt="La fila del evento en Eventos recientes, con el interruptor En juego activado" />
        </Step>
      </Section>

      <Section id="run" title="Paso 3: Dirigir el evento">
        <Step title="Abre Juez principal">
          <p>
            Inicia sesión en la computadora del juez principal, abre <strong>Juez principal</strong> desde el Panel de
            control y elige tu evento en la pestaña <strong>Eventos</strong>.
          </p>
          <p>
            Junto al nombre del evento está el <strong>PIN de jueces</strong> (2 dígitos). Cada dispositivo de jueceo
            lo ingresa una vez. <strong>Nuevo PIN</strong> crea uno nuevo y cierra la sesión de todos los
            dispositivos. Los eventos de prueba no tienen PIN.
          </p>
          <Shot name="hj-header" lang="es" alt="La parte de arriba de Juez principal: el evento, Copiar enlace del locutor, el PIN de jueces y las pestañas" />
        </Step>
        <Step title="Elige el grupo en juego">
          <p>
            En la pestaña <strong>Grupos</strong>, haz clic en <strong>Poner como grupo en juego</strong> en el grupo
            que juega a continuación. La pantalla de cada juez lo sigue sola.
          </p>
          <Shot
            name="hj-pools"
            lang="es"
            alt="La pestaña Grupos: cada grupo con Poner como grupo en juego, Bloquear, Publicar resultados y Copiar enlace; el grupo B está En juego"
          />
        </Step>
        <Note>
          Para <strong>Fpa2027</strong>, sigue los pasos de abajo. Para <strong>Simple Ranking</strong>, la
          preparación terminó y el juego puede empezar: los jueces ordenan el grupo en juego (Paso 4).
        </Note>
        <Step title="Elige el equipo que sigue">
          <p>
            En la pestaña <strong>Juego</strong>, haz clic en el equipo en la lista de equipos. El primer equipo se
            elige al poner el grupo. Los jueces aparecen con un punto que muestra si la pantalla de cada uno está
            conectada.
          </p>
          <Shot
            name="hj-play"
            lang="es"
            alt="La pestaña Juego antes de la rutina: Clic en el primer lanzamiento, los equipos con el primero Jugando ahora, y los jueces"
          />
        </Step>
        <Step title="Haz clic en Clic en el primer lanzamiento en el primer lanzamiento de la rutina">
          <p>Esto inicia la rutina y el cronómetro en todas las pantallas.</p>
          <p>
            Espera a los jueces. Cada uno muestra <strong>Terminó</strong> cuando envía su puntaje. Cuando todos lo
            hayan hecho, haz clic en <strong>Clic para pasar al siguiente equipo</strong> (o{' '}
            <strong>Clic para terminar el último equipo</strong>). Luego repite con el siguiente equipo.
          </p>
          <Shot
            name="hj-play-running"
            lang="es"
            alt="La pestaña Juego durante una rutina: el cronómetro corriendo, el botón que pide esperar a los jueces y un juez conectado"
          />
        </Step>
        <Step title="Si algo sale mal">
          <Bullets>
            <li>
              Empezaste el equipo equivocado o demasiado pronto: mantén presionado <strong>Cancelar rutina</strong>{' '}
              durante 1 segundo, elige el equipo correcto y empieza de nuevo.
            </li>
            <li>
              Cancelaste por error: mantén presionado <strong>Restaurar puntajes de la rutina cancelada</strong>{' '}
              durante 1 segundo.
            </li>
            <li>
              Un juez envió por error: inicia de nuevo la rutina de ese equipo para ese juez. Cuenta su puntaje más
              reciente.
            </li>
          </Bullets>
        </Step>
        <Step title="Bloquea el grupo cuando termine">
          <p>
            <strong>Bloquear</strong> en la pestaña Grupos impide que se cambien sus puntajes, equipos y jueces en
            cualquier lugar. Desbloquear siempre funciona.
          </p>
        </Step>
        <Step title="Opcional: el locutor y la música">
          <Bullets>
            <li>
              <strong>Copiar enlace del locutor</strong> (junto al nombre del evento) da una página para el locutor,
              con el grupo en escena, quién sigue y el cronómetro. No hace falta iniciar sesión.
            </li>
            <li>
              <strong>Música del evento</strong> reproduce la canción de cada equipo en la computadora de la música y
              sigue al equipo que está jugando.
            </li>
          </Bullets>
        </Step>
      </Section>

      <Section id="judges" title="Paso 4: Preparar a los jueces">
        <Step title="En cada dispositivo de juez, ve a freestylejudge.com/new">
          <p>
            <strong>No inicies sesión en estos dispositivos.</strong> Los botones de los jueces solo aparecen sin
            sesión iniciada (o usa una ventana privada).
          </p>
        </Step>
        <Step title="Presiona el botón propio del juez">
          <p>
            Cada evento en juego muestra un botón por cada juez del grupo en juego, con su nombre y categoría. Cada
            juez presiona el suyo.
          </p>
          <Shot name="judge-home" lang="es" alt="Un teléfono con los botones de los jueces del evento, cada uno con nombre y categoría" />
          <p>
            En un grupo de Simple Ranking, los jueces presionan el botón <strong>Juzgar</strong> del evento y ordenan
            los equipos con las flechas hacia arriba y abajo; <strong>Enviar</strong> se activa cuando todos los
            equipos tienen un puesto.
          </p>
        </Step>
        <Step title="Ingresa el PIN de jueces">
          <p>
            Escribe el PIN de 2 dígitos de la página del Juez principal. Marca <strong>Recordar este dispositivo</strong>{' '}
            para que no lo pida otra vez.
          </p>
          <Shot name="judge-pin" lang="es" alt="El teclado del PIN en el teléfono de un juez, con Recordar este dispositivo marcado" />
        </Step>
        <Step title="Deja la pantalla abierta">
          <p>
            La pantalla es el puesto del juez. Sigue sola al grupo y al equipo en juego, así que prepárala una vez y
            déjala así. Cuando el juez principal hace clic en el primer lanzamiento, empieza el cronómetro del juez y
            toma sus notas.
          </p>
          <Shot name="judge-screen" lang="es" alt="El teléfono de un juez de Ejecución durante una rutina: el cronómetro y los botones de notas" />
        </Step>
        <Step title="Si falta el botón de un juez, revisa en este orden">
          <Numbered>
            <li>Las reglas de la división son Fpa2027 (no Fpa2020) y se hizo clic en Guardar ajustes.</li>
            <li>El evento tiene activado En juego.</li>
            <li>El juez está asignado al grupo que está en juego ahora.</li>
            <li>El dispositivo no tiene sesión iniciada.</li>
          </Numbered>
        </Step>
      </Section>

      <Section id="results" title="Paso 5: Obtener los resultados">
        <Step title="Mira los resultados en vivo">
          <p>
            La pestaña <strong>Resultados</strong> del Juez principal muestra los resultados de un grupo a medida que
            los jueces envían: el puntaje de cada juez, los totales y puestos, y una gráfica de la rutina de cada
            equipo.
          </p>
          <Shot
            name="hj-results"
            lang="es"
            alt="Los resultados de un grupo: la tabla Resumen con el puntaje de cada juez, totales y puestos, y la gráfica de los equipos"
          />
        </Step>
        <Step title="Publica y comparte el enlace">
          <p>
            Cada grupo tiene su propio enlace público (sin iniciar sesión), como{' '}
            <strong>freestylejudge.com/r/Yx7Kp2Qm</strong>. Arriba de los resultados del grupo, haz clic en{' '}
            <strong>Publicar resultados</strong> y luego en <strong>Copiar enlace</strong>. Pégalo en un correo, un
            chat o una publicación.
          </p>
          <Bullets>
            <li>Antes de publicar, el enlace muestra solo los equipos en orden de juego y los nombres de los jueces.</li>
            <li>
              Después de publicar, muestra los resultados completos, sin nombrar nunca a los jueces (solo
              &quot;Dificultad #1&quot;, etc.), así que se puede compartir públicamente.
            </li>
            <li>
              La página tiene menús de División, Ronda y Grupo para llegar a todos los demás grupos del evento, así que
              un enlace basta para todo el evento.
            </li>
            <li>Publicar también envía los resultados al canal de Discord del evento, si tiene uno.</li>
          </Bullets>
          <Shot
            name="public-results"
            lang="es"
            alt="La página pública de resultados: menús de División, Ronda y Grupo, y el Resumen con los jueces como Ejecución #1, etc."
          />
        </Step>
      </Section>

      <Section id="help" title="Práctica y ayuda">
        <Bullets>
          <li>
            El <strong>Entrenador de jueceo</strong> (Panel de control) es un grupo de práctica de 8 equipos donde haces
            de juez principal y de cada juez. No se guarda nada.
          </li>
          <li>
            Juez principal y el Creador de eventos tienen un botón de chat (abajo a la derecha) que responde preguntas
            sobre las herramientas.
          </li>
        </Bullets>
      </Section>
    </Page>
  );
}
