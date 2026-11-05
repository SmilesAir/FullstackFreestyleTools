'use client';

import type { TrainerView } from './DebugBar';
import { link } from './TrainerStartGuide';

// The trainer's landing page in Latin American Spanish: the same content as
// TrainerStartGuide.tsx (keep the two in step).
export function TrainerStartGuideEs({ onView }: { onView: (view: TrainerView) => void }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 text-sm leading-relaxed" lang="es-419">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Entrenador de jueceo</h1>
        <p className="text-gray-600">
          Practica el jueceo FPA2027 con un grupo inventado de 8 equipos. Haces de cada juez: Juez Diff, Juez AI y Juez
          Ex. Usas las pantallas de juez reales y el cálculo de puntajes real, pero todo queda en este navegador. No se
          guarda nada en el servidor y nadie más lo ve.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">Cómo usarlo</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Abre{' '}
            <button type="button" onClick={() => onView('results')} className={link}>
              Resultados
            </button>
            . La tabla Resumen tiene un botón <strong>Iniciar</strong> debajo de cada juez para cada equipo.
          </li>
          <li>
            Presiona <strong>Iniciar</strong> debajo de un juez. La rutina de ese equipo empieza para ese juez (3:00) y se
            abre su pantalla.
          </li>
          <li>
            Toma notas mientras se juega la rutina. Ejecución e Impresión Artística usan botones. Dificultad usa la recta:
            toca qué tan difícil fue el movimiento y luego califícalo Bueno, Normal o Malo.
          </li>
          <li>
            A los 3:00 aparece <strong>Ingresar puntaje</strong> arriba. Para llegar antes, presiona{' '}
            <strong>Terminar antes</strong> en la barra. Revisa el gráfico y la base, sube o baja el puntaje con las
            flechas si quieres, y presiona <strong>Enviar</strong>.
          </li>
          <li>
            Vuelve a Resultados. El puntaje está en la tabla, y el botón Iniciar de ese juez y equipo ya no está. Haz lo
            mismo con los demás jueces y equipos, y mira cómo se completan los totales y los lugares.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">La barra de arriba</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Nuevo evento de prueba</strong> borra todas las notas y puntajes, y deja los 8 equipos sin jugar.
          </li>
          <li>
            <strong>Guía de inicio</strong> es esta página.
          </li>
          <li>
            <strong>Juez Diff</strong>, <strong>Juez AI</strong> y <strong>Juez Ex</strong> abren la pantalla de ese
            juez. Cambia cuando quieras. La pestaña <strong>Revisión</strong> de cada juez muestra sus gráficos de todos
            los equipos.
          </li>
          <li>
            <strong>Resultados</strong> muestra los resultados completos del grupo, como los ve el juez principal. Las
            rutinas se inician desde aquí.
          </li>
          <li>
            <strong>Terminar antes</strong> detiene la rutina en curso, para poder ingresar el puntaje enseguida.
          </li>
          <li>El texto de al lado muestra qué equipo y qué juez están jugando, y el tiempo de la rutina.</li>
        </ul>
        <p className="text-gray-600">Lo que haces se guarda en este navegador, así que al recargar sigues donde quedaste.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">Aprende más</h2>
        <p>
          <button type="button" onClick={() => onView('description')} className={link}>
            Descripción FPA2027
          </button>{' '}
          explica el sistema de jueceo: las notas de cada categoría, lo que vale cada nota, cómo se calculan el gráfico y
          la base, y cómo se deciden los resultados y los lugares. También puedes hacer preguntas en el chat (el botón de
          la esquina inferior derecha).
        </p>
      </section>
    </main>
  );
}
