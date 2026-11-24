# domesticas-api

Función en Vercel (https://domesticas-api.vercel.app) de las apps domésticas. Ver README.md. El plan general está en
pablocarvallo/casa (plan/plan-5-apps.md y ecosistema.json); los datos, en el repositorio privado pablocarvallo/datos.

- Funciones de Node sin dependencias (`api/*.js`, ESM, firma `handler(req, res)`). Estáticos en `public/`.
- El token de GitHub solo vive en la variable `GITHUB_TOKEN` de Vercel. Nunca escribirlo en el código ni en el chat.
- Toda ruta nueva pasa por `preparar` (CORS solo para https://pablocarvallo.github.io), `autorizar` con un permiso
  de `PERMISOS` (lib/llaves.js) y `manejar`.
- Cada cambio de comportamiento va con su prueba en `pruebas/` (`node --test pruebas/*.test.mjs`).
- Textos y mensajes de commit en español latino neutro. Cada push a main publica en producción.
