// GET /api/datos?archivo=movimientos/2026-11.json → { contenido, sha }
// GET /api/datos?carpeta=movimientos → { contenido: ["2026-11.json", …] }
// PUT /api/datos?archivo=… con { contenido, sha, mensaje } → { sha }. Con el sha leído antes: si otro dispositivo
// cambió el archivo mientras tanto, responde 409 y hay que volver a leerlo.
import { preparar, responder, cuerpo, manejar, error } from '../lib/http.js';
import { autorizar } from '../lib/llaves.js';
import { leerArchivo, escribirArchivo } from '../lib/github.js';

const ARCHIVOS = /^(?:cuentas|pagos|creditos|gastos-medicos|mesadas|ciclos|rutinas|maletas|resumen|salud)\.json$|^movimientos\/\d{4}-(?:0[1-9]|1[0-2])\.json$/;
const SOLO_LECTURA = /^(?:resumen|salud)\.json$/;   // los calculan las tareas
const CARPETAS = ['movimientos'];
const MAX_BYTES = 900000;

export function archivoPermitido(a) { return ARCHIVOS.test(String(a || '')); }

export default async function handler(req, res) {
  if (!preparar(req, res, ['GET', 'PUT'])) return;
  await manejar(res, async () => {
    const q = req.query || {};
    if (req.method === 'GET') {
      await autorizar(req, 'leer');
      if (q.carpeta) {
        if (!CARPETAS.includes(q.carpeta)) throw error(400, 'Carpeta no permitida');
        const { contenido } = await leerArchivo(q.carpeta);
        return responder(res, 200, { contenido: (contenido || []).filter((n) => /\.json$/.test(n)).sort() });
      }
      if (!archivoPermitido(q.archivo)) throw error(400, 'Archivo no permitido');
      return responder(res, 200, await leerArchivo(q.archivo));
    }
    const llave = await autorizar(req, 'escribir');
    if (!archivoPermitido(q.archivo)) throw error(400, 'Archivo no permitido');
    if (SOLO_LECTURA.test(q.archivo)) throw error(403, 'Este archivo lo calculan las tareas y no se escribe desde las apps');
    const b = cuerpo(req);
    if (!b.contenido || typeof b.contenido !== 'object') throw error(400, 'Falta el contenido');
    if (Buffer.byteLength(JSON.stringify(b.contenido)) > MAX_BYTES) throw error(413, 'El archivo es demasiado grande');
    const mensaje = `${llave.nombre}: ${String(b.mensaje || 'actualiza ' + q.archivo).replace(/\s+/g, ' ').slice(0, 120)}`;
    const sha = await escribirArchivo(q.archivo, b.contenido, b.sha || null, mensaje);
    responder(res, 200, { sha });
  });
}
