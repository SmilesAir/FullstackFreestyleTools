// The trainer's Description in Latin American Spanish: the same content as
// TrainerDescription.tsx (keep the two in step; the numbers are the defaults in
// lib/judging-settings.ts).

import { Code, Section, Shot, table, td, th } from './TrainerDescription';

export function TrainerDescriptionEs() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-sm leading-relaxed" lang="es-419">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Jueceo Fpa2027</h1>
        <p className="text-gray-600">Un resumen del sistema según su documento de diseño, y luego cómo lo calcula esta app.</p>
      </header>

      <Section title="El sistema">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Tres categorías, cada una con sus propios jueces: <strong>Dificultad</strong>,{' '}
            <strong>Impresión Artística</strong> y <strong>Ejecución</strong>.
          </li>
          <li>
            Los jueces toman notas <strong>en tiempo real</strong> con botones mientras se juega la rutina. La mayor parte
            del jueceo ocurre durante la rutina, no después.
          </li>
          <li>
            Cuando termina la rutina, las notas se convierten en un <strong>gráfico</strong> por categoría, y la
            computadora calcula a partir de ellas una <strong>estimación base</strong> del puntaje.
          </li>
          <li>
            El juez compara su impresión con el gráfico y puede <strong>ajustar</strong> la estimación. La computadora
            solo sugiere; el juez puede enviar el puntaje que quiera.
          </li>
          <li>
            Los gráficos de cada equipo se muestran juntos para poder comparar equipos, y los{' '}
            <strong>gráficos de los demás jueces se superponen</strong> para que cada juez vea la opinión de todos antes
            de enviar.
          </li>
          <li>
            Cada juez envía <strong>un puntaje</strong>. Los puntajes de un equipo se <strong>suman</strong>, y gana el
            equipo con más puntos.
          </li>
        </ul>
      </Section>

      <Section title="Las notas">
        <h3 className="font-semibold">Dificultad: dos pasos</h3>
        <p>
          El juez toca una <strong>recta</strong> (con nombres de movimientos marcados) según qué tan difícil fue el
          movimiento, y luego califica qué tan bien se hizo: <strong>Malo</strong>, <strong>Normal</strong> o{' '}
          <strong>Bueno</strong>.
        </p>
        <h3 className="font-semibold">Impresión Artística: tres áreas</h3>
        <ul className="list-disc pl-5">
          <li>Trabajo en equipo: Menor, Aceptable, Excelente</li>
          <li>Música: Aceptable, Excelente</li>
          <li>Forma: Mala, Buena</li>
        </ul>
        <h3 className="font-semibold">Ejecución: penalizaciones y limpieza</h3>
        <p>Error grande, Error medio, Error menor, Completado normal, Completado limpio.</p>
      </Section>

      <Section title="Las pantallas del juez">
        <p>
          Cada juez tiene dos pestañas: <strong>Juego</strong> para tomar notas mientras corre la rutina, y{' '}
          <strong>Revisión</strong> para todos los equipos del grupo.
        </p>
        <h3 className="font-semibold">Juego: tomar notas</h3>
        <Shot src="ex-play.png" alt="La pestaña Juego del juez de Ejecución: cinco botones de notas, cada uno con un botón de menos">
          Ejecución. Toca un botón cada vez que pasa; la cuenta aparece en el botón y el − de al lado quita la última. El
          equipo y el tiempo de la rutina están arriba. (Las capturas muestran la pantalla en inglés.)
        </Shot>
        <Shot src="ai-play.png" alt="La pestaña Juego del juez de Impresión Artística: botones agrupados en Trabajo en equipo, Música y Forma">
          Impresión Artística, con sus botones en Trabajo en equipo, Música y Forma.
        </Shot>
        <Shot src="diff-play.png" alt="La pestaña Juego del juez de Dificultad: una recta marcada con Chair, Gitis y Double Barrell Gitis, con las notas en una fila abajo">
          Dificultad. Toca la recta a la altura de la dificultad del movimiento y luego califícalo. Cada nota aparece en la
          fila de abajo con su calificación y su tiempo; toca una para moverla, calificarla de nuevo o borrarla.
        </Shot>
        <h3 className="font-semibold">Ingresar puntaje</h3>
        <Shot src="ex-dialog.png" alt="El diálogo Ingresar puntaje: las notas como gráfico, botones de notas, la estimación base, flechas de ajuste, Volver y Enviar">
          Cuando se acaba el tiempo de la rutina, Ingresar puntaje abre esto: las notas como gráfico, los botones para
          agregar o corregir notas, la Estimación base y las flechas que ajustan Tu puntaje antes de Enviar.
        </Shot>
        <Shot src="diff-dialog.png" alt="El diálogo Ingresar puntaje del juez de Dificultad, con el gráfico sobre la recta">
          Lo mismo para Dificultad, con la recta debajo del gráfico.
        </Shot>
        <h3 className="font-semibold">Revisión: todos los equipos</h3>
        <Shot src="ex-review.png" alt="La pestaña Revisión: un gráfico por equipo con el puntaje del juez y las flechas de ajuste al lado">
          Cada equipo como gráfico con su puntaje al lado. Un puntaje anterior se puede cambiar aquí con las flechas; la
          rutina que sigue en curso muestra su estimación hasta que se envía.
        </Shot>
      </Section>

      <Section title="Cómo calcula la app">
        <p>
          El documento de diseño deja abierta la matemática del gráfico y de la estimación. Esto es lo que hace la app,
          con su configuración predeterminada (un juez principal puede cambiarla para un evento en la pestaña Ajustes de
          Juez principal).
        </p>

        <h3 className="font-semibold">Lo que vale cada nota</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Ejecución</th>
                <th className={th}>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Completado limpio', '+2'],
                ['Completado normal', '+1'],
                ['Error menor', '−1'],
                ['Error medio', '−2'],
                ['Error grande', '−3'],
              ].map(([n, v]) => (
                <tr key={n}>
                  <td className={td}>{n}</td>
                  <td className={`${td} tabular-nums`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className={table}>
            <thead>
              <tr>
                <th className={th}>Impresión Artística</th>
                <th className={th}>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Trabajo en equipo Excelente / Aceptable / Menor', '+3 / +2 / +1'],
                ['Música Excelente / Aceptable', '+2 / +1'],
                ['Forma Buena / Mala', '+1 / −1'],
              ].map(([n, v]) => (
                <tr key={n}>
                  <td className={td}>{n}</td>
                  <td className={`${td} tabular-nums`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Dificultad</strong>: la recta va de 0 abajo a 3 puntos arriba, con Chair en 0.6, Gitis en 1.5 y Double
          Barrell Gitis en 2.4. Una nota vale <strong>dónde se tocó × el multiplicador de la calificación</strong>: Bueno
          ×2, Normal ×1, Malo ×0.3. Un Gitis bien hecho vale 1.5 × 2 = 3 puntos.
        </p>

        <h3 className="font-semibold">El gráfico</h3>
        <p>
          Cada nota agrega una curva suave en forma de campana en su momento (de unos 4 segundos de ancho). La línea es la
          suma de todas las curvas, así que las notas cercanas se apilan en una colina alta y las alejadas quedan
          separadas. Lo que está sobre cero es verde, lo de abajo es rojo.
        </p>

        <h3 className="font-semibold">La estimación base</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Ejecución e Impresión Artística</strong>: la suma de lo que vale cada nota. El momento no importa.
          </li>
          <li>
            <strong>Dificultad</strong>: el área bajo todo el gráfico, escalada para que cada nota cuente sus propios
            puntos. El área se extiende más allá del inicio y del final, así que cuándo se tomó una nota no importa: es la
            suma de los puntos de las notas.
          </li>
          <li>Redondeada a 1 decimal.</li>
        </ul>

        <h3 className="font-semibold">El ajuste del juez</h3>
        <p>
          Las flechas cambian el puntaje en un 1% o un 10% del tamaño de la base, así que subir siempre significa más alto,
          incluso por debajo de cero. Cerca de 0 la base casi no tiene tamaño, así que el tamaño nunca es menor que diez
          notas comunes (un Completado normal, un Trabajo en equipo menor, un Chair normal): ahí el 10% es una de esas
          notas y el 1% una décima. Puntaje = base + máx(|base|, 10 × nota) × porcentaje ÷ 100, redondeado a 2
          decimales.
        </p>

        <h3 className="font-semibold">Resultados</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Por equipo: el puntaje de cada juez, un total por categoría y el total del equipo (todos los puntajes sumados).</li>
          <li>
            Lugar según el total del equipo, de mayor a menor. Totales iguales comparten lugar (dos 2.º y luego 4.º). Sin
            puntaje todavía, no hay lugar.
          </li>
          <li>
            Un equipo que jugó más de una vez (jueces puntuando de a uno, como en este entrenador) cuenta el puntaje más
            reciente de cada juez. Una rutina cancelada no cuenta.
          </li>
          <li>Los gráficos muestran los jueces de cada categoría promediados en una línea, y las líneas de todos los equipos juntas.</li>
        </ul>
        <Shot
          src="pool-compare.png"
          alt="Los gráficos de dos equipos, uno sobre otro, en el mismo eje de tiempo, cada uno con su puntaje y flechas de ajuste"
          width={1587}
          height={328}
        >
          Equipos lado a lado: el mismo eje de tiempo para cada uno, para que un juez vea cómo se compara una rutina con
          otra antes de definir los puntajes.
        </Shot>
      </Section>

      <Section title="Cómo funciona el código">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Evento en vivo.</strong> El juez principal inicia una rutina; la pantalla de cada juez consulta al
            servidor, los toques se guardan como notas (<Code>fpa2027_judge_notes</Code>) con su hora, y se conservan en
            el navegador hasta que el servidor los tiene.
          </li>
          <li>
            <strong>Ingresar puntaje.</strong> Al llegar a la duración de la rutina, la pantalla dibuja el gráfico y la
            estimación (<Code>score-curve.ts</Code>). Al Enviar, el servidor vuelve a calcular la base a partir de las
            notas guardadas con el mismo código (<Code>judging-estimate.ts</Code>) y la guarda con el porcentaje y el
            puntaje (<Code>fpa2027_judge_scores</Code>), así el número guardado es el que vio el juez.
          </li>
          <li>
            <strong>Las líneas de los demás jueces</strong> llegan del servidor ya promediadas por categoría (
            <Code>judging-curves.ts</Code>): las notas de un juez nunca se envían a otro.
          </li>
          <li>
            <strong>Los resultados</strong> suman los puntajes y ordenan los equipos (<Code>pool-standings.ts</Code>), los
            mismos números que muestran Juez principal, la página pública de resultados y Discord.
          </li>
          <li>
            <strong>Este entrenador</strong> usa las mismas pantallas y la misma matemática, pero guarda las notas y los
            puntajes en este navegador en vez de en la base de datos (<Code>judging-trainer.ts</Code>). Nadie más los ve.
          </li>
        </ol>
      </Section>
    </main>
  );
}
