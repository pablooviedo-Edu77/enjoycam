# StrangerCam

Prueba web de videochat aleatorio y moderacion. La app se sirve como sitio estatico desde `index.html` y no necesita un proceso de compilacion.

## Probar en local

Abre `index.html` en un navegador moderno. Acepta la verificacion +18 y pulsa **Buscar Siguiente**. Si no hay una camara disponible, se usa un video de simulacion. El panel de moderacion se abre con el PIN de demostracion `admin123`.

Sin configuracion de Firebase, la aplicacion funciona en **Demo local**: los mensajes del extraño son simulados y reportes, bloqueos, blacklist y avisos se guardan en el almacenamiento del navegador. No representa una sala compartida entre dispositivos.

La camara y el microfono requieren permiso del navegador y un contexto seguro. GitHub Pages proporciona HTTPS; al abrir el archivo local, el navegador puede restringir el acceso a dispositivos.

## Publicar en GitHub Pages

El workflow de `.github/workflows/pages.yml` valida el HTML/JavaScript y publica `index.html` al hacer push a `main` o al ejecutarlo manualmente desde Actions.

En GitHub, abre **Settings > Pages** y elige **GitHub Actions** como fuente de despliegue. Cuando termine el workflow, la URL sera `https://<usuario>.github.io/<repositorio>/`.

## Videochat real

La version publicada sin backend es una prueba funcional local. Para conectar usuarios en dispositivos distintos hace falta configurar un proyecto Firebase con Authentication anonima, Firestore, reglas de acceso seguras y autorizacion administrativa del lado del servidor. El PIN incluido es publico y solo sirve para demostraciones; no protege acciones administrativas en produccion. No habilites reglas abiertas de Firestore para hacer funcionar la demo.

## Verificacion

```bash
python3 scripts/smoke_test.py
```

El workflow instala Node.js y ejecuta el mismo smoke test con `--require-node` para comprobar la sintaxis del modulo JavaScript antes de publicar.
