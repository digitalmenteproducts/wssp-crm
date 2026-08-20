# Meta OAuth / WhatsApp Embedded Signup (infraestructura)

## Callback de producción

```
https://wssp-crm.vercel.app/api/oauth/meta/callback
```

Registrar exactamente esa URI en Meta → Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**.

Allowed Domains: `wssp-crm.vercel.app`

## Rutas

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/oauth/meta/start` | Sesión + empresa activa + `state` firmado + redirect a Meta |
| GET | `/api/oauth/meta/callback` | Recibe `code`/`state`, intercambia token, redirige a Configuración |
| POST | `/api/oauth/meta/complete` | Completa Embedded Signup (SDK futuro): `code` + `waba_id` + `phone_number_id` |

## Variables de entorno (Vercel)

Ya existentes:

- `META_APP_SECRET` (también firma del webhook)
- `NEXT_PUBLIC_APP_URL=https://wssp-crm.vercel.app`

Nuevas:

- `META_APP_ID` — App ID de Meta
- `NEXT_PUBLIC_META_APP_ID` — mismo App ID (para SDK futuro)
- `META_LOGIN_CONFIG_ID` — Configuration ID de Facebook Login for Business (Embedded Signup)
- `NEXT_PUBLIC_META_LOGIN_CONFIG_ID` — opcional, mismo valor para cliente futuro

## Configuración en Meta

1. App **Digitalmente CRM** → Facebook Login for Business → Settings  
   Activar: Client OAuth Login, Web OAuth Login, Enforce HTTPS, Embedded Browser OAuth Login, Strict Mode, Login with JS SDK.
2. Valid OAuth Redirect URI = callback de arriba.
3. Allowed Domains = `wssp-crm.vercel.app`
4. Configurations → Create → **WhatsApp Embedded Signup** → copiar Configuration ID → `META_LOGIN_CONFIG_ID`.
5. Permisos: `whatsapp_business_management`, `whatsapp_business_messaging`.

## Qué falta (siguiente paso)

- SDK client `FB.login` + `config_id`
- Listener de session info (WABA + Phone Number ID)
- Llamada a `POST /api/oauth/meta/complete`
- Subscribe webhook / overrides por WABA
- Coexistencia WhatsApp Business App
- Conexión real del número de Tredici (después de probar con sandbox)

## Seguridad

- `state` HMAC con `META_APP_SECRET`, TTL 10 min, cookie httpOnly
- Empresa tomada del workspace + state firmado (no del query libre)
- Solo `owner` / `admin`
- Tokens no van en query de vuelta a la UI
