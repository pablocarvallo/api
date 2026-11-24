// Acceso al repositorio privado de datos con el token guardado en Vercel (GITHUB_TOKEN).
export const REPO = process.env.DATOS_REPO || 'pablocarvallo/datos';

async function gh(ruta, opciones = {}) {
  if (!process.env.GITHUB_TOKEN) { const e = new Error('Falta GITHUB_TOKEN'); e.github = 500; throw e; }
  const r = await fetch('https://api.github.com/repos/' + REPO + ruta, {
    ...opciones,
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'domesticas-api',
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opciones.headers || {}),
    },
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error('GitHub ' + r.status + ' en ' + ruta + ': ' + (datos && datos.message));
    e.status = r.status;
    // Un cambio con una versión (sha) vieja responde 409, y a veces 422
    e.github = r.status === 422 && /sha/i.test(String(datos && datos.message)) ? 409 : r.status;
    throw e;
  }
  return datos;
}

// { contenido, sha }; contenido null si el archivo no existe
export async function leerArchivo(ruta) {
  try {
    const d = await gh('/contents/' + encodeURI(ruta));
    if (Array.isArray(d)) return { contenido: d.map((x) => x.name), sha: null };   // una carpeta: sus nombres
    // Sobre 1 MB GitHub no manda el contenido en base64 (encoding «none»): se pide el archivo tal cual
    if (d.encoding === 'none' || (!d.content && d.size > 0)) {
      return { contenido: await gh('/contents/' + encodeURI(ruta), { headers: { Accept: 'application/vnd.github.raw+json' } }), sha: d.sha };
    }
    return { contenido: JSON.parse(Buffer.from(d.content, 'base64').toString('utf8')), sha: d.sha };
  } catch (e) {
    if (e.github === 404) return { contenido: null, sha: null };
    throw e;
  }
}

// Guarda un archivo. Con sha, solo si nadie lo cambió desde que se leyó (si no, error 409). Devuelve el sha nuevo.
export async function escribirArchivo(ruta, contenido, sha, mensaje) {
  const texto = JSON.stringify(contenido, null, 2) + '\n';
  const d = await gh('/contents/' + encodeURI(ruta), {
    method: 'PUT',
    body: JSON.stringify({ message: mensaje, content: Buffer.from(texto, 'utf8').toString('base64'), ...(sha ? { sha } : {}) }),
  });
  return d.content.sha;
}

// Crea un archivo que no debe existir. Si ya existe responde { existia: true } sin tocarlo (GitHub contesta 422 cuando
// falta el sha de un archivo que ya está). Si alguien guardó otra cosa al mismo tiempo (409), lo intenta de nuevo.
export async function crearArchivo(ruta, contenido, mensaje) {
  for (let intento = 1; ; intento++) {
    try { await escribirArchivo(ruta, contenido, null, mensaje); return { existia: false }; }
    catch (e) {
      if (e.status === 422) return { existia: true };
      if (e.status !== 409 || intento >= 3) throw e;
      await new Promise((r) => setTimeout(r, 300 * intento));
    }
  }
}
