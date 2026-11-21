// Vista oculta /primitivas: catálogo vivo de brandbook/primitivas.css (botones, pestañas, chips, campos e interruptores)
// en los temas claro y noche. No está enlazada desde la app; sirve para revisar los controles al cambiarlos.
// Usa los mismos componentes que las pantallas (Segmentos, Interruptor), así que lo que se ve aquí es lo que se ve allá.
import { useId, useState } from 'react'
import { Icono } from '../../ui/Icono'
import { Interruptor, Segmentos } from '../../ui/piezas'
import './primitivas.css'

type Periodo = '7d' | '4s' | 'todo'
const PERIODOS: { v: Periodo; n: string }[] = [
  { v: '7d', n: '7 días' },
  { v: '4s', n: '4 semanas' },
  { v: 'todo', n: 'Todo' },
]
const GESTOS = ['Todos', 'Pinza', 'Agarre', 'Alcance']

function Muestras({ tema }: { tema: 'claro' | 'noche' }) {
  const id = useId()
  const [pestana, setPestana] = useState(0)
  const [periodo, setPeriodo] = useState<Periodo>('4s')
  const [gesto, setGesto] = useState('Todos')
  const [recordatorios, setRecordatorios] = useState(true)
  const [anonimos, setAnonimos] = useState(false)
  const [codigo, setCodigo] = useState('CRM-48')
  const codigoMalo = !/^CRM-\d{4}$/.test(codigo)

  return (
    <section className={`prim-tema ${tema === 'noche' ? 'kuwu-noche' : ''}`} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{tema === 'claro' ? 'Tema claro' : 'Tema noche (.kuwu-noche: cámara y juego)'}</h2>

      <h3>Botones</h3>
      <button type="button" className="boton primario bloque">
        Empezar
      </button>
      <div className="prim-fila">
        <button type="button" className="boton secundario">
          Secundario
        </button>
        <button type="button" className="boton peligro">
          Borrar datos
        </button>
      </div>
      <div className="prim-fila">
        <button type="button" className="boton primario chico">
          Chico
        </button>
        <button type="button" className="boton secundario chico">
          <Icono nombre="descarga" tam={18} /> Con ícono
        </button>
        <button type="button" className="boton primario chico" disabled>
          Deshabilitado
        </button>
        <button type="button" className="boton texto">
          Texto
        </button>
        <button type="button" className="boton-icono" aria-label="Atrás">
          <Icono nombre="atras" />
        </button>
      </div>

      <h3>Pestañas</h3>
      <div className="segmentos" role="tablist" aria-label="Vista">
        {['Resumen', 'Sesiones', 'Notas'].map((n, i) => (
          <button key={n} type="button" role="tab" aria-selected={pestana === i} onClick={() => setPestana(i)}>
            {n}
          </button>
        ))}
      </div>
      <p className="ayuda-campo">role="tablist" + aria-selected: cambia de panel. Abajo, el componente Segmentos (aria-pressed): elige un valor.</p>
      <Segmentos opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} etiqueta="Período" />

      <h3>Chips</h3>
      <div className="chips" role="group" aria-label="Filtrar por gesto">
        {GESTOS.map((g) => (
          <button key={g} type="button" className="chip" aria-pressed={gesto === g} onClick={() => setGesto(g)}>
            {g}
          </button>
        ))}
      </div>
      <div className="prim-tarjeta">
        <p className="ayuda-campo">Sobre una tarjeta: .chips.en-tarjeta</p>
        <div className="chips en-tarjeta" role="group" aria-label="Filtrar por gesto (en tarjeta)">
          {GESTOS.slice(1).map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={gesto === g} onClick={() => setGesto(g)}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <h3>Campos</h3>
      <div className="campo">
        <label htmlFor={`${id}-correo`}>Correo</label>
        <input id={`${id}-correo`} className="entrada" type="email" placeholder="nombre@correo.cl" aria-describedby={`${id}-correo-ayuda`} />
        <p id={`${id}-correo-ayuda`} className="ayuda-campo">
          Texto de ayuda bajo el campo.
        </p>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-codigo`}>Código de la clínica</label>
        <input
          id={`${id}-codigo`}
          className="entrada entrada-codigo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          aria-invalid={codigoMalo}
          aria-describedby={`${id}-codigo-error`}
        />
        {codigoMalo ? (
          <p id={`${id}-codigo-error`} className="error-campo">
            Escribe CRM- y 4 cifras.
          </p>
        ) : null}
      </div>
      <div className="campo">
        <label htmlFor={`${id}-nota`}>Nota</label>
        <textarea id={`${id}-nota`} className="entrada" placeholder="¿Cómo te sentiste?" />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-mano`}>Mano</label>
        <select id={`${id}-mano`} className="entrada" defaultValue="derecha">
          <option value="izquierda">Izquierda</option>
          <option value="derecha">Derecha</option>
          <option value="ambas">Ambas</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-des`}>Deshabilitado</label>
        <input id={`${id}-des`} className="entrada" value="No editable" disabled readOnly />
      </div>

      <h3>Interruptores</h3>
      <div className="prim-interruptor">
        <span>Recordatorios</span>
        <Interruptor marcado={recordatorios} onCambio={setRecordatorios} etiqueta="Recordatorios" />
      </div>
      <div className="prim-interruptor">
        <span>Datos anónimos</span>
        <Interruptor marcado={anonimos} onCambio={setAnonimos} etiqueta="Datos anónimos" />
      </div>
      <div className="prim-interruptor">
        <span>Deshabilitado (encendido)</span>
        <Interruptor marcado deshabilitado etiqueta="Deshabilitado encendido" />
      </div>
      <div className="prim-interruptor">
        <span>Deshabilitado (apagado)</span>
        <Interruptor marcado={false} deshabilitado etiqueta="Deshabilitado apagado" />
      </div>
    </section>
  )
}

export default function Primitivas() {
  return (
    <main className="pantalla primitivas">
      <header>
        <h1>Primitivas</h1>
        <p className="ayuda-campo">
          Controles de brandbook/primitivas.css (README del brandbook §7). Vista interna, no enlazada en la app.
        </p>
      </header>
      <div className="prim-temas">
        <Muestras tema="claro" />
        <Muestras tema="noche" />
      </div>
    </main>
  )
}
