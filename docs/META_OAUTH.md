# Meta OAuth / WhatsApp Embedded Signup

## Callback de producción

```
https://wssp-crm.vercel.app/api/oauth/meta/callback
```

Registrar exactamente esa URI en Meta → Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**.

Allowed Domains: `wssp-crm.vercel.app`

Webhook compartido (todos los clientes):

```
https://wssp-crm.vercel.app/api/webhooks/whatsapp
```

## Flujo Embedded Signup

1. Usuario en **Configuración → Integraciones** pulsa **Conectar WhatsApp**.
2. Cliente llama `GET /api/oauth/meta/start` (`Accept: application/json`) → cookie `state` + `appId` + `configId`.
3. Cliente carga Meta JS SDK y ejecuta `FB.login` con:
   - `config_id` = `NEXT_PUBLIC_META_LOGIN_CONFIG_ID`
   - `response_type: "code"`
   - `extras.featureType: "whatsapp_business_app_onboarding"` (coexistencia)
   - `extras.sessionInfoVersion: "3"`
4. Listener `message` (`WA_EMBEDDED_SIGNUP`) captura `waba_id` / `phone_number_id`.
5. Cliente envía a `POST /api/oauth/meta/complete` solo `{ code, state, waba_id, phone_number_id, coexistence }`.
6. Servidor valida state/membresía/empresa activa, intercambia code→token con **App Secret**, suscribe WABA (`/{waba-id}/subscribed_apps`), guarda en `business_settings` de esa empresa.
7. **No** se registra el número si coexistence (ya está en WhatsApp Business App).

## Rutas

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/oauth/meta/start` | JSON: prepara Embedded Signup + cookie state |
| GET | `/api/oauth/meta/callback` | URI OAuth válida; redirige a Integraciones |
| POST | `/api/oauth/meta/complete` | Exchange code + persistencia + subscribe webhook |
| POST | `/api/oauth/meta/disconnect` | Limpia credenciales de la empresa activa |

## Variables de entorno (Vercel)

Obligatorias para Embedded Signup:

| Variable | Dónde | Notas |
|----------|--------|-------|
| `META_APP_ID` | Server | App ID |
| `NEXT_PUBLIC_META_APP_ID` | Client | Mismo App ID (SDK) |
| `META_APP_SECRET` | Server | Nunca en cliente; también firma webhook |
| `META_LOGIN_CONFIG_ID` | Server | Configuration ID |
| `NEXT_PUBLIC_META_LOGIN_CONFIG_ID` | Client | Mismo Configuration ID |
| `NEXT_PUBLIC_APP_URL` | Ambos | `https://wssp-crm.vercel.app` (nunca el dashboard `vercel.com/...`) |
| `APP_URL` | Server (opcional) | Misma URL pública; tiene prioridad en callbacks OAuth |

## Configuration ID en Meta

1. App **Digitalmente CRM** (Live) → **Facebook Login for Business** → **Configurations**.
2. **Create configuration** → tipo **WhatsApp Embedded Signup**.
3. Incluir productos/permisos:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
   - (y lo que Meta pida para Embedded Signup)
4. Si el builder v4 ofrece **WhatsApp Business App onboarding / Coexistence**, actívalo en la configuración.
5. Copiar el **Configuration ID** → `META_LOGIN_CONFIG_ID` y `NEXT_PUBLIC_META_LOGIN_CONFIG_ID`.

Además en Login Settings:

- Client OAuth Login, Web OAuth Login, Enforce HTTPS
- Embedded Browser OAuth Login, Login with the JavaScript SDK
- Valid OAuth Redirect URI = callback de arriba
- Allowed Domains = `wssp-crm.vercel.app`
- JS SDK domain = `wssp-crm.vercel.app`

App debe estar registrada como **Tech Provider** (además de App Review / Access Verification).

## Coexistencia (WhatsApp Business App)

Soportada vía `featureType: whatsapp_business_app_onboarding`.

- Evento de fin: `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (a veces sin `phone_number_id`; el backend lo resuelve listando `/{waba}/phone_numbers`).
- **No** llamamos a register phone (migración no destructiva).
- WhatsApp Business App del cliente sigue operativa; Cloud API recibe webhooks en la URL compartida.
- Sync de historial SMB (contactos/mensajes 24h) **no** está implementado aún; no es requisito para recibir mensajes nuevos.

Requisitos Meta: cliente con WhatsApp Business App ≥ 2.24.17; app Tech Provider; webhook operativo.

## Seguridad multiempresa

- `business_id` sale del workspace autenticado + state firmado (HMAC `META_APP_SECRET`).
- El cliente **nunca** envía `business_id`.
- Solo roles `owner` / `admin`.
- Tokens solo en servidor; UI muestra número, WABA, estado y fecha.
- Webhook único; tenant = `whatsapp_phone_number_id` único → `business_id`.

## Prueba con activos de desarrollo (antes del piloto)

1. Configurar env en Vercel + redeploy.
2. En Meta → WhatsApp → API Setup, usar el número de prueba de la app.
3. Entrar al CRM con tu usuario (no Tredici).
4. Integraciones → marcar/desmarcar coexistencia según el activo de prueba.
5. **Conectar WhatsApp** → completar Embedded Signup.
6. Verificar en UI: estado Conectado, WABA, Phone Number ID.
7. Enviar mensaje de prueba al número de test y confirmar inbound en Conversaciones.
8. **No** conectar el número real de Tredici hasta aprobación explícita.
