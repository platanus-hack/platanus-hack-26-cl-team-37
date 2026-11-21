// Juegos de PRUEBA de la base común (F09). No aparecen en /ejercicios: sirven para probar la base con e2e y
// como ejemplo mínimo del contrato para los juegos reales (F10, F11, F22–F27).
//  - 'prueba-shell': cerrar y abrir la mano cerca de una esfera cuenta 1 cierre (agarre_inicio → agarre_fin).
//  - 'prueba-fisica': lo mismo, y además deja caer una bola con Rapier (usaFisica: true) para probar que la física
//    se carga solo cuando el juego la declara. Su tercera métrica en vivo es la altura de la bola sobre la mesa.
import * as THREE from 'three'
import { kuwuNum } from '../../ui/paleta'
import { tono } from '../shell/colores'
import type { LadoMano } from '../../domain/types'
import type { ContextoJuego, CrearJuego, EstadoManoHud, ModuloJuego, NumeroNivel, ParametrosNivel } from '../shell/contrato'

/** Umbrales de cierre/apertura (apertura calibrada si hay calibración; si no, la normalizada), con histéresis. */
export const UMBRAL_CIERRE = 0.35
export const UMBRAL_APERTURA = 0.7

const niveles = Object.fromEntries(
  ([1, 2, 3, 4, 5] as NumeroNivel[]).map((n) => [n, { nombre: `Nivel ${n}`, detalle: `Esfera de tamaño ${6 - n}`, radio: 0.34 - n * 0.04 }]),
) as unknown as Record<NumeroNivel, ParametrosNivel>

function crearPrueba(conFisica: boolean): ModuloJuego {
  let ctx: ContextoJuego | null = null
  let esfera: THREE.Mesh | null = null
  let material: THREE.MeshStandardMaterial | null = null
  let bola: { malla: THREE.Mesh; cuerpo: import('@dimforge/rapier3d-compat').RigidBody } | null = null
  const cerrada: Record<LadoMano, boolean> = { izquierda: false, derecha: false }
  let cierres = 0
  let tiempo = 0

  const soltarBola = () => {
    if (!bola) return
    bola.cuerpo.setTranslation({ x: 0.9, y: 1.6, z: -0.3 }, true)
    bola.cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }

  return {
    id: conFisica ? 'prueba-fisica' : 'prueba-shell',
    nombre: conFisica ? 'Prueba de física' : 'Prueba de la base',
    gestos: ['Apertura', 'Cierre de puño'],
    miniatura: 'movilidad',
    niveles,
    meta: { etiqueta: 'Cierres', unidad: 'cierres', desdePlan: (p) => p.metaAgarres },
    tiposEvento: ['agarre_inicio', 'agarre_fin'],
    metricasVivo: [
      { id: 'apertura', nombre: 'Apertura de la mano', unidad: '%', formula: 'aperturaMano (puntas–muñeca / palma), con el rango de la calibración', mejor: 'mayor' },
      { id: 'flexIndice', nombre: 'Flexión del índice', unidad: '°', formula: 'flexión MCP + PIP del índice (worldLandmarks)', aprox: true },
      conFisica
        ? { id: 'alturaBola', nombre: 'Altura de la bola', unidad: 'cm', formula: 'y del cuerpo rígido sobre la mesa × 10 cm/unidad' }
        : { id: 'pinza', nombre: 'Apertura de pinza', unidad: 'cm', formula: 'distancia 4–8 en worldLandmarks × escala de la calibración', aprox: true },
    ],
    metricasResumen: [{ id: 'cierres', nombre: 'Cierres', unidad: '', formula: 'agarre_fin anotados', mejor: 'mayor' }],
    usaFisica: conFisica,
    pista: 'Cierra y abre la mano',
    textoReiniciar: 'Reiniciar',

    montar(c) {
      ctx = c
      material = new THREE.MeshStandardMaterial({ color: kuwuNum('menta'), roughness: 0.35, emissive: tono('menta', 0.15) })
      const r = Number(c.nivel.radio ?? 0.25)
      esfera = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), material)
      esfera.position.set(0, c.mesa.altura + r, c.mesa.z)
      esfera.castShadow = true
      c.escena.add(esfera)
      if (c.fisica) {
        const { RAPIER, mundo } = c.fisica
        const radio = 0.16
        const cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0.9, 1.6, -0.3))
        mundo.createCollider(RAPIER.ColliderDesc.ball(radio).setRestitution(0.35), cuerpo)
        const malla = new THREE.Mesh(new THREE.SphereGeometry(radio, 24, 16), new THREE.MeshStandardMaterial({ color: kuwuNum('azul'), roughness: 0.4 }))
        malla.castShadow = true
        c.escena.add(malla)
        bola = { malla, cuerpo }
      }
    },

    actualizar(_manos, dt) {
      if (!ctx) return
      tiempo += dt
      for (const lado of ['izquierda', 'derecha'] as LadoMano[]) {
        const m = ctx.medidas(lado)
        if (!m) {
          cerrada[lado] = false
          continue
        }
        const a = m.aperturaCalibrada ?? Math.min(1, m.apertura)
        if (!cerrada[lado] && a < UMBRAL_CIERRE) {
          cerrada[lado] = true
          ctx.registrar('agarre_inicio', { mano: lado, objeto: 'esfera', datos: { apertura: Math.round(a * 100) / 100 } })
        } else if (cerrada[lado] && a > UMBRAL_APERTURA) {
          cerrada[lado] = false
          cierres++
          ctx.registrar('agarre_fin', { mano: lado, objeto: 'esfera', datos: { cierre: cierres } })
        }
      }
      if (esfera && material) {
        const alguna = cerrada.izquierda || cerrada.derecha
        material.color.setHex(alguna ? kuwuNum('amarillo') : kuwuNum('menta'))
        esfera.rotation.y += dt * 0.8
        esfera.scale.setScalar(alguna ? 0.85 : 1 + Math.sin(tiempo * 3) * 0.03)
      }
      if (bola) {
        const p = bola.cuerpo.translation()
        bola.malla.position.set(p.x, p.y, p.z)
        const q = bola.cuerpo.rotation()
        bola.malla.quaternion.set(q.x, q.y, q.z, q.w)
      }
    },

    hud() {
      const principal = ctx?.manoPrincipal() ?? null
      const m = principal ? ctx!.medidas(principal) : null
      const manos: Partial<Record<LadoMano, EstadoManoHud>> = {}
      for (const lado of ['izquierda', 'derecha'] as LadoMano[]) {
        if (ctx?.medidas(lado)) manos[lado] = cerrada[lado] ? { texto: 'Cerrada', tono: 'acento' } : { texto: 'Abierta', tono: 'ok' }
      }
      const alturaBola = bola ? Math.max(0, (bola.cuerpo.translation().y - 0.16 - (ctx?.mesa.altura ?? 0)) * 10) : null
      return {
        contador: cierres,
        manos,
        vivo: {
          apertura: m ? Math.round(Math.min(1, m.aperturaCalibrada ?? m.apertura) * 100) : null,
          flexIndice: m ? m.flexion.indice : null,
          pinza: m ? m.aperturaPinzaCm : null,
          alturaBola,
        },
      }
    },

    reiniciar() {
      soltarBola()
    },

    muestra() {
      const principal = ctx?.manoPrincipal()
      const m = principal ? ctx!.medidas(principal) : null
      return { aperturaMano: m ? m.apertura : null }
    },

    resumen() {
      return { cierres }
    },

    desmontar() {
      if (esfera) ctx?.escena.remove(esfera)
      if (bola) ctx?.escena.remove(bola.malla)
      esfera?.geometry.dispose()
      material?.dispose()
      bola?.malla.geometry.dispose()
      ctx = null
      esfera = null
      bola = null
    },
  }
}

export const crearPruebaShell: CrearJuego = () => crearPrueba(false)
export const crearPruebaFisica: CrearJuego = () => crearPrueba(true)
