// POST /api/emparejar con { "codigo": "ABCD-2345" } → { llave, id, nombre, tipo }. El código se crea con la tarea
// «Llaves» de pablocarvallo/datos, vale 15 minutos y sirve una vez. La llave se muestra solo en esta respuesta.
import { preparar, responder, cuerpo, manejar } from '../lib/http.js';
import { canjear } from '../lib/llaves.js';

export default async function handler(req, res) {
  if (!preparar(req, res, ['POST'])) return;
  await manejar(res, async () => {
    responder(res, 200, await canjear(cuerpo(req).codigo));
  });
}
