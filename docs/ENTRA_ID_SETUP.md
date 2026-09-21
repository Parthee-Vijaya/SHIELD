# Microsoft Entra ID til Hammeren

Hammeren bruger OAuth 2.0 authorization code med PKCE i React-klienten og
validerer access tokenet igen i FastAPI. ID-tokenet må kun bruges til visning i
brugergrænsefladen; API'et autoriserer på det validerede access token.

Officielle Microsoft-referencer:

- [Authorization code med PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [App-roller i tokens](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps)
- [Validering af access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)

## 1. Registrér Hammeren API

1. Opret en appregistrering for API'et i kommunens workforce-tenant.
2. Under **Expose an API**, angiv Application ID URI og opret det delegerede
   scope `access_as_user`.
3. Opret følgende app-roller for `Users/Groups`:
   - `Hammeren.Sagsbehandler`
   - `Hammeren.Godkender`
   - `Hammeren.DPO`
   - `Hammeren.Admin`
4. Tildel roller til kommunale sikkerhedsgrupper i Enterprise Applications.

## 2. Registrér Hammeren SPA

1. Opret en separat appregistrering for React-klienten.
2. Tilføj redirect URI som typen **Single-page application**. Brug HTTPS i
   produktion; `http://localhost` kan bruges til lokal integrationstest.
3. Giv SPA'en delegeret adgang til API-scope'et `access_as_user` og gennemfør
   admin consent efter kommunens proces.
4. Aktivér ikke implicit grant. MSAL bruger authorization code med PKCE.

## 3. Konfigurér deployment

Backend:

```dotenv
APP_ENV=production
AUTH_MODE=entra
ENTRA_TENANT_ID=<tenant-guid>
ENTRA_API_AUDIENCE=api://<api-app-guid>
ENTRA_REQUIRED_SCOPE=access_as_user
```

Frontend-build:

```dotenv
REACT_APP_AUTH_MODE=entra
REACT_APP_ENTRA_TENANT_ID=<tenant-guid>
REACT_APP_ENTRA_CLIENT_ID=<spa-app-guid>
REACT_APP_ENTRA_API_SCOPE=api://<api-app-guid>/access_as_user
REACT_APP_ENTRA_REDIRECT_URI=https://<hammeren-domæne>
```

`APP_ENV=production` accepterer ikke udvikleridentiteten. En godkendelse eller
idriftsættelse kræver rollen `Hammeren.Godkender`, `Hammeren.DPO` eller
`Hammeren.Admin`; sagsbehandlerrollen kan forberede og sende sagen til review.
