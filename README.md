# StrangerCam

Aplicacion de videochat aleatorio con Firebase Authentication, Firestore, WebRTC y moderacion. El sitio principal esta en Firebase Hosting.

## Produccion

- Firebase Hosting: https://igneous-core-391404.web.app
- Proyecto Firebase: `igneous-core-391404`
- GitHub Pages se conserva como respaldo; su workflow ahora solo valida cambios.
- El acceso usa correo y contrasena, mas el enlace nativo de verificacion de Firebase. El OTP personalizado fue retirado.

## Plan Spark

Hosting, Authentication Email/Password y Firestore Rules estan configurados para Spark. La app ofrece una única sala general con chat de texto compartido por Firestore para usuarios con correo verificado; la vista de cámara muestra la cámara local.

El video entre varias personas, matching transaccional, acciones de moderacion y limpieza programada siguen implementados como Cloud Functions y requieren Blaze. El chat compartido funciona en Spark sin esas funciones; no se debe abrir Firestore Rules para simular moderacion.

## Firebase

La configuracion publica de la app esta en `firebase-config.js`; no contiene credenciales administrativas. Restringe su API key a las APIs necesarias y a los dominios de Hosting que uses.

En Firebase Console, Authentication debe tener Email/Password habilitado. Configura la plantilla **Email address verification** y revisa los dominios autorizados. Las reglas `firestore.rules` exigen el claim nativo `email_verified` y ya estan desplegadas.

## Desplegar Hosting y reglas

El alias local `.firebaserc` apunta a este proyecto y esta ignorado por Git. Requiere Node 22 y una sesion autorizada de Firebase CLI:

```bash
npm exec --yes --package=node@22 --package=firebase-tools@14 -- firebase login
npm exec --yes --package=node@22 --package=firebase-tools@14 -- firebase deploy --only hosting,firestore:rules --project igneous-core-391404
```

Para despliegue automatico desde GitHub Actions, configura la variable `FIREBASE_PROJECT_ID` y el secreto `FIREBASE_SERVICE_ACCOUNT`. El workflow `.github/workflows/firebase-deploy.yml` publica Hosting y reglas, no secretos de aplicacion.

## Activar Cloud Functions

Para habilitar salas/matching, moderacion y metricas se necesita Blaze y desplegar Functions. El backend ya no requiere Resend ni secretos OTP:

```bash
npm --prefix functions install
npm exec --yes --package=node@22 --package=firebase-tools@14 -- firebase deploy --only functions --project igneous-core-391404
```

No configures una cuenta de servicio ni cambies el plan si prefieres permanecer en Spark. Para usar todas las funciones sin Blaze hay que migrarlas a otro servicio de backend y revisar sus reglas de acceso.

## Moderacion

Despues de desplegar Functions y verificar una cuenta, el claim `moderator` se concede con Admin SDK desde un entorno administrador. Nunca desde el navegador. El usuario debe cerrar e iniciar sesion para refrescar su token.

## WebRTC

Firestore intercambia ofertas, respuestas y candidatos ICE; el chat viaja por `RTCDataChannel`. Solo hay STUN publico configurado. Para conexiones fiables tras NAT restrictivo hace falta un proveedor TURN con credenciales efimeras. Camara y microfono requieren HTTPS y permiso del usuario.

## Pruebas

```bash
npm --prefix functions test
python3 scripts/smoke_test.py
npm exec --yes --package=node@22 --package=firebase-tools@14 -- firebase emulators:exec --project strangercam-rules-test --only firestore "npm --prefix functions run test:rules"
```

La suite verifica autorizacion por correo, acceso a cola, privacidad de reportes, signaling entre participantes y restricciones de moderacion. El emulador de Firestore necesita Java.