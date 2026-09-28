# StrangerCam

Aplicación de videochat aleatorio con cuenta de correo verificado, WebRTC y moderación. La interfaz se publica en GitHub Pages; Firebase Authentication y Firestore son compatibles con Spark. Algunas funciones de servidor requieren un backend adicional.

## Estado desplegado

`firebase-config.js` ya apunta al proyecto Firebase `igneous-core-391404`. El acceso usa contraseña de Firebase y el enlace nativo de verificación de correo; el OTP personalizado está retirado. Authentication y Firestore pueden funcionar con Spark, pero las salas, matching y moderación actual dependen de Cloud Functions y requieren Blaze o migrar esas funciones a un servicio externo.

## Requisitos

- Proyecto Firebase con Authentication y Firestore habilitados.
- Facturación Blaze solo si se conserva el backend Cloud Functions actual.
- Firebase Authentication con proveedor Email/Password activado.
- Firestore Native mode.
- Node.js 22, npm, Firebase CLI y Java para los emuladores.

## Configurar Firebase

1. La aplicación web ya está registrada en Firebase y su configuración pública reside en `firebase-config.js`. Estos valores identifican el proyecto y no son credenciales administrativas.

Restringe la API key desde Google Cloud a las APIs y dominios que uses, incluyendo `pablooviedo-edu77.github.io` y `localhost` durante pruebas.

Opcionalmente, configura estas **Actions variables** para que Pages genere la configuración al publicar desde el entorno de GitHub: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`; también admite `FIREBASE_STORAGE_BUCKET` y `FIREBASE_MESSAGING_SENDER_ID`.

2. En Authentication, habilita Email/Password y configura la plantilla **Email address verification**. La aplicación solicita el enlace nativo de verificación y no inicia sesión en Firestore hasta que Firebase marque el correo como verificado.

3. Instala Firebase CLI y selecciona el proyecto:

```bash
npm install --global firebase-tools
cp .firebaserc.example .firebaserc
firebase login
firebase use --add
```

Reemplaza `YOUR_FIREBASE_PROJECT_ID` en `.firebaserc` por el ID real. `.firebaserc` está excluido de Git.

4. Para desplegar las funciones server-side actuales se necesita Blaze. No se requieren secretos OTP/Resend: esa función se retiró.

```bash
npm --prefix functions install
```

Despliega Functions y reglas:

```bash
firebase deploy --only functions,firestore:rules
```

Las reglas deniegan todo salvo operaciones específicas de cuentas verificadas. El matching y las acciones admin usan Functions con Admin SDK; las reglas cliente no permiten modificar roles, bans o configuración.

El workflow `.github/workflows/firebase-deploy.yml` puede desplegar las funciones si activas Blaze y configuras la variable Actions `FIREBASE_PROJECT_ID` y el secreto `FIREBASE_SERVICE_ACCOUNT`.

## Primer moderador

Después de crear y verificar una cuenta, concede el claim de moderador desde un entorno administrador con Application Default Credentials. Nunca lo hagas desde el navegador:

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

Las pruebas cubren el bloqueo de cuentas sin correo verificado, aislamiento de cola, privacidad de reportes, participantes WebRTC y denegación de escrituras administrativas directas. GitHub Actions ejecuta las pruebas de autorización y reglas antes de publicar la interfaz.

## Publicación

El workflow `.github/workflows/pages.yml` publica el sitio estático en cada push a `main` y ejecuta pruebas de autorización de correo y Firestore Rules en emulador. Si faltan las variables web, la página queda en Demo local. El deploy de Functions requiere Blaze y la cuenta de servicio; Pages por sí solo no puede desplegar ese backend.
