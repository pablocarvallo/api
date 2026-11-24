// Llaves por dispositivo. En datos/dispositivos.json solo se guarda la huella (SHA-256) de cada llave.
import { createHash, randomBytes } from 'node:crypto';
import { leerArchivo, escribirArchivo } from './github.js';
import { error } from './http.js';

export const PERMISOS = {
  dispositivo: ['leer', 'escribir', 'resumen', 'push'],
  atajos: ['aviso'],
  widget: ['resumen'],
};

export function huella(texto) { return createHash('sha256').update(String(texto)).digest('hex'); }

let cache = null, cacheHora = 0;
async function cargar(forzar) {
  if (!forzar && cache && Date.now() - cacheHora < 60000) return cache;
  const { contenido } = await leerArchivo('dispositivos.json');
  cache = contenido || { llaves: [], pendientes: [] };
  cacheHora = Date.now();
  return cache;
}
export function olvidarCache() { cache = null; }

// Revisa la llave de la petición (Authorization: Bearer …) y que tenga el permiso. Devuelve la llave (sin secreto).
export async function autorizar(req, permiso) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) throw error(401, 'Falta la llave del dispositivo');
  const h = huella(m[1]);
  let l = (await cargar(false)).llaves.find((x) => x.hash === h);
  if (!l) l = (await cargar(true)).llaves.find((x) => x.hash === h);   // una llave recién creada
  if (!l) throw error(401, 'Llave no válida o revocada');
  if (!(PERMISOS[l.tipo] || []).includes(permiso)) throw error(403, 'Esta llave no permite esta acción');
  return { id: l.id, nombre: l.nombre, tipo: l.tipo };
}

// Canjea un código de un solo uso (creado con la tarea «Llaves») por una llave. La llave se muestra una sola vez.
export async function canjear(codigoTexto) {
  const codigo = String(codigoTexto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (codigo.length !== 8) throw error(400, 'El código tiene 8 letras y números');
  for (let intento = 0; intento < 3; intento++) {
    const { contenido, sha } = await leerArchivo('dispositivos.json');
    const datos = contenido || { llaves: [], pendientes: [] };
    datos.llaves = datos.llaves || [];
    datos.pendientes = (datos.pendientes || []).filter((p) => Date.parse(p.vence) > Date.now());
    const i = datos.pendientes.findIndex((p) => p.hash === huella(codigo));
    if (i < 0) throw error(400, 'Código no válido, ya usado o vencido');
    const p = datos.pendientes[i];
    const llave = randomBytes(32).toString('base64url');
    const id = randomBytes(3).toString('hex');
    datos.llaves.push({ id, nombre: p.nombre, tipo: p.tipo, hash: huella(llave), creada: new Date().toISOString() });
    datos.pendientes.splice(i, 1);
    try {
      await escribirArchivo('dispositivos.json', datos, sha, `Llaves: emparejado «${p.nombre}»`);
      olvidarCache();
      return { llave, id, nombre: p.nombre, tipo: p.tipo };
    } catch (e) {
      if (e.github !== 409 || intento === 2) throw e;   // otro cambio al mismo tiempo: se repite
    }
  }
}
