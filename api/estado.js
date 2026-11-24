// GET /api/estado — para revisar que la función está publicada y tiene el token configurado (sin mostrarlo).
import { preparar, responder } from '../lib/http.js';

export default function handler(req, res) {
  if (!preparar(req, res, ['GET'])) return;
  responder(res, 200, { ok: true, servicio: 'domesticas-api', token_configurado: !!process.env.GITHUB_TOKEN, hora: new Date().toISOString() });
}
