// POST /api/aviso — Atajos entrega un correo de aviso. Queda como issue en pablocarvallo/datos y la tarea
// «Leer avisos» lo convierte en movimientos. Cuerpo: { "fuente": "bancochile" | "copec", "asunto": "…", "texto": "…" }
import { preparar, responder, cuerpo, manejar, error } from '../lib/http.js';
import { autorizar } from '../lib/llaves.js';
import { crearIssue } from '../lib/github.js';

const MAX = 60000;   // un issue admite hasta 65.536 caracteres

export default async function handler(req, res) {
  if (!preparar(req, res, ['POST'])) return;
  await manejar(res, async () => {
    await autorizar(req, 'aviso');
    const b = cuerpo(req);
    const texto = String(b.texto || b.cuerpo || '');
    if (!texto.trim()) throw error(400, 'Falta el texto del aviso');
    const f = String(b.fuente || '').toLowerCase();
    const fuente = f === 'bancochile' || f === 'copec' ? f : '';
    const asunto = String(b.asunto || 'Aviso').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Aviso';
    const issue = await crearIssue(asunto, (fuente ? 'Fuente: ' + fuente + '\n' : '') + texto.slice(0, MAX));
    responder(res, 201, { ok: true, aviso: issue.number });
  });
}
