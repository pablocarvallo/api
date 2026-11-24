// GET /api/resumen — el resumen que calculan las tareas (saldos, últimos movimientos, sábanas, alertas).
// Sirve con una llave de widget, que no puede leer ni escribir nada más.
import { preparar, responder, manejar } from '../lib/http.js';
import { autorizar } from '../lib/llaves.js';
import { leerArchivo } from '../lib/github.js';

export default async function handler(req, res) {
  if (!preparar(req, res, ['GET'])) return;
  await manejar(res, async () => {
    await autorizar(req, 'resumen');
    const { contenido } = await leerArchivo('resumen.json');
    responder(res, 200, contenido || {});
  });
}
