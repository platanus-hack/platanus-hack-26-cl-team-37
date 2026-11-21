import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import { resumenDispositivo, VERSION_APP, versionModelo } from './version'

describe('versiones de la sesión', () => {
  it('VERSION_APP calza con package.json', () => {
    expect(VERSION_APP).toBe(pkg.version)
  })

  it('versionModelo según la fuente', () => {
    expect(versionModelo('sintetica')).toMatch(/sin modelo/)
    expect(versionModelo('camara', 'CPU')).toMatch(/hand_landmarker.*CPU$/)
  })

  it('resumenDispositivo: sistema y navegador, sin más detalles', () => {
    expect(resumenDispositivo('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36')).toBe('Android 14 · Chrome 131')
    expect(resumenDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('iOS 17.5 · Safari 17')
    expect(resumenDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0')).toBe('Windows · Edge 140')
    expect(resumenDispositivo('algo')).toBe('Otro · Navegador')
  })
})
