// Respuestas, CORS y errores comunes a todas las rutas.
const ORIGENES = ['https://pablocarvallo.github.io'];

export function error(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  e.publico = mensaje;
  return e;
}

export function responder(res, status, cuerpo) {
  res.status(status).json(cuerpo);
}

// Encabezados comunes. Devuelve false si la petición ya quedó respondida (OPTIONS o método no permitido).
export function preparar(req, res, metodos) {
  const origen = req.headers.origin;
  if (origen && ORIGENES.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', metodos.concat('OPTIONS').join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (!metodos.includes(req.method)) { responder(res, 405, { error: 'Método no permitido' }); return false; }
  return true;
}

// El cuerpo como objeto: Atajos puede enviar JSON o texto
export function cuerpo(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  const t = Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : '';
  if (!t) return {};
  try { return JSON.parse(t); } catch { return { texto: t }; }
}

export async function manejar(res, fn) {
  try {
    await fn();
  } catch (e) {
    if (e.publico) return responder(res, e.status, { error: e.publico });
    if (e.github === 409) return responder(res, 409, { error: 'Los datos cambiaron mientras tanto: vuelve a leerlos y repite el cambio.' });
    if (e.github) return responder(res, 502, { error: 'GitHub respondió ' + e.github });
    console.error(e);
    responder(res, 500, { error: 'Error interno' });
  }
}
