# StrangerCam

Aplicación de videochat aleatorio con verificación de correo, OTP de 8 dígitos, WebRTC y moderación. La interfaz se publica en GitHub Pages; Firebase Authentication, Cloud Functions y Firestore proporcionan el backend.

## Estado desplegado

GitHub Pages sirve el modo demo local hasta configurar un proyecto Firebase. En demo los mensajes son simulados y los datos de moderación viven en el navegador. El OTP no se simula ni se valida en el cliente: la cuenta real se habilita solo con Firebase y Functions configurados.

## Requisitos

- Proyecto Firebase con facturación Blaze habilitada para Cloud Functions.
- Cloud Scheduler habilitado para depurar presencia/salas y refrescar métricas cada minuto.
- Firebase Authentication con proveedor Email/Password activado.
- Firestore Native mode.
- Node.js 22, npm, Firebase CLI y Java para los emuladores.
- Cuenta Resend con dominio remitente verificado.

## Configurar Firebase

1. Crea el proyecto y una aplicación web en Firebase Console. Para desarrollar localmente, configura `firebase-config.js`:

```js
window.__firebase_config = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  appId: "..."
};
```

Estos valores identifican la aplicación; no son claves administrativas. Restringe la API key desde Google Cloud a las APIs y dominios que uses, incluyendo `pablooviedo-edu77.github.io` y `localhost` durante pruebas.

Para producción, no hace falta editar el archivo: en GitHub, crea estas **Actions variables** del repositorio para que Pages genere la configuración al publicar: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`; opcionalmente `FIREBASE_STORAGE_BUCKET` y `FIREBASE_MESSAGING_SENDER_ID`.

2. En Authentication, habilita Email/Password. La aplicación crea la cuenta con correo y contraseña; Functions envía un código aleatorio de 8 cifras, válido durante 10 minutos, limitado a 5 intentos y con límites de reenvío. Se almacena un HMAC, no el código en claro. El correo remitente es `EMAIL_FROM` y debe estar verificado en Resend.

3. Instala Firebase CLI y selecciona el proyecto:

```bash
npm install --global firebase-tools
cp .firebaserc.example .firebaserc
firebase login
firebase use --add
```

Reemplaza `YOUR_FIREBASE_PROJECT_ID` en `.firebaserc` por el ID real. `.firebaserc` está excluido de Git.

4. Instala dependencias del backend y crea los secretos desde una terminal local. La CLI solicita los valores sin incorporarlos al código:

```bash
npm --prefix functions install
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set EMAIL_FROM
firebase functions:secrets:set OTP_HMAC_SECRET
```

Usa un secreto aleatorio largo para `OTP_HMAC_SECRET`, por ejemplo generado localmente con `openssl rand -hex 32`. No lo publiques ni lo compartas en el chat.

5. Despliega Functions y reglas:

```bash
firebase deploy --only functions,firestore:rules
```

Las reglas deniegan todo salvo operaciones específicas de cuentas verificadas. El matching y las acciones admin usan Functions con Admin SDK; las reglas cliente no permiten modificar roles, bans o configuración.

El workflow `.github/workflows/firebase-deploy.yml` puede hacer este despliegue en cada push que cambie Functions o reglas. Para habilitarlo, crea la variable Actions `FIREBASE_PROJECT_ID` y el secreto Actions `FIREBASE_SERVICE_ACCOUNT` con una cuenta de servicio limitada al proyecto. Sin esos datos el job no se ejecuta; no se incluyen credenciales en el repositorio.

## Primer moderador

Después de crear y verificar una cuenta, concede el claim desde un entorno administrador con Application Default Credentials. Nunca lo hagas desde el navegador:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/segura/service-account.json npm --prefix functions run moderator -- moderador@example.com grant
```

El usuario debe cerrar sesión e iniciarla de nuevo para refrescar su token. Para revocar el rol, usa `revoke`. El archivo de credenciales no debe entrar en Git.

## Comunicación WebRTC

Firestore intercambia ofertas, respuestas y candidatos ICE entre los dos participantes emparejados; el chat viaja por un `RTCDataChannel` WebRTC. La configuración incluida tiene servidores STUN públicos. Para redes simétricas, carrier-grade NAT o conexiones más fiables en producción, añade un proveedor TURN y credenciales efímeras a `rtcConfig`; STUN por sí solo no garantiza conexión entre cualquier par.

Cámara y micrófono requieren HTTPS y permiso del usuario. GitHub Pages sirve HTTPS. Si no hay cámara, el navegador local usa el simulador; con Firebase configurado, un error de signaling se informa y no se disfraza como una conexión real.

## Pruebas

```bash
npm --prefix functions install
npm --prefix functions run test:unit
npx firebase-tools emulators:exec --project strangercam-rules-test --only firestore "npm --prefix functions run test:rules"
python3 scripts/smoke_test.py
```

Las pruebas de reglas cubren acceso sin verificación, aislamiento de cola, privacidad de reportes, participantes WebRTC y denegación de escrituras administrativas directas. GitHub Actions ejecuta las pruebas OTP y de reglas antes de publicar la interfaz.

## Publicación

El workflow `.github/workflows/pages.yml` publica el sitio estático en cada push a `main` y ejecuta tests OTP y Firestore Rules en emulador. Si faltan las variables web, la página queda en Demo local. Functions y reglas requieren el proyecto, los secretos Resend/HMAC y la cuenta de servicio provisionados; Pages por sí solo no puede crear esos recursos.
