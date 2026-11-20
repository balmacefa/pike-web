---
name: "isv-dsl-spec"
author: "Pike-ISV-D (DSL-author, enjambre ISV)"
updated: "2026-11-01"
description: "Catálogo DSL formal de IBM Verify: puente op-Verify → request REST → receta engine.mjs → nodo/plantilla n8n. Fuente para AUTO-GENERAR workflows en vez de hacerlos a mano."
---

# ISV DSL Spec — catálogo de operaciones IBM Verify

Consolida lo verificado por el enjambre:
- **Pike-ISV-V** — mapeo del tenant + ops REST (sesión admin / token API client) y wizards UI (ref `janus/ref-ibm-verify-admin.md`).
- **Pike-ISV-N** — plantillas de workflow n8n (workflow `HqNhDPFlJEKh5Z2t`, credencial `lRgURi90b9DGfmjD`).
- **Pike-ISV-D** (este doc) — recetas `engine.mjs` en `recipes.json` y el puente op→REST→receta→nodo.

Tenant: `https://YOUR-TENANT.verify.ibm.com` (abreviado `<T>` abajo).

---

## 0. Modelo de ejecución (3 carriles, misma op)

Cada operación de Verify se puede ejecutar por **3 carriles equivalentes**; el generador elige según el contexto:

| Carril | Cuándo | Artefacto | Auth |
|---|---|---|---|
| **REST** (preferido) | provisioning programático, bulk, backend | request `method/path/body/schemas` | token: `POST /v1.0/endpoint/default/token` (client_credentials) **o** token de sesión admin (`window.__vAuth`, kit V3) |
| **engine.mjs** (UI) | cuando no hay API verificada o se quiere "ver" el flujo | receta en `recipes.json` (DSL de ops) | sesión de navegador (CDP) ya logueada como admin |
| **n8n** (orquestación) | flujos agendados, multi-paso, bulk con throttle | nodo HTTP Request parametrizado / plantilla `ISV-TPL:*` | credencial n8n httpCustomAuth `lRgURi90b9DGfmjD` |

**Regla de oro (ref regla 1):** API-first. `V.get()` es ~100× más rápido que clicar. UI solo para flujos sin API verificada o demos.

---

## 1. TABLA PUENTE op-Verify → REST → receta engine → nodo n8n

Leyenda: ✅ = request REST verificado 200/201 JSON por Pike-ISV-V. Headers SCIM: `Authorization: Bearer <token>`, `Content-Type: application/scim+json`, `Accept: application/scim+json`. JSON normal: `application/json`.

### 1.1 Autenticación (prerrequisito de todo carril REST/n8n)

| op | method | path | body | schemas | receta engine | nodo n8n |
|---|---|---|---|---|---|---|
| **get-token** (client credentials) | POST | `/v1.0/endpoint/default/token` | `grant_type=client_credentials&client_id=<ID>&client_secret=<SECRET>` (form-urlencoded) | — | — (lo da el navegador) | nodo **"Get Token"** (HTTP Request, httpCustomAuth cred `lRgURi90b9DGfmjD`; body solo `grant_type`). Salida: `{{ $('Get Token').access_token }}` |

### 1.2 Grupos

| op | method | path | body | schemas | receta engine | nodo/plantilla n8n |
|---|---|---|---|---|---|---|
| **list-groups** ✅ | GET | `/v2.0/Groups?attributes=displayName&filter=displayName sw "x"` | — | SCIM | — | HTTP Request GET |
| **create-group** ✅ (201) | POST | `/v2.0/Groups` | `{displayName, 'urn:ietf:params:scim:schemas:extension:ibm:2.0:Group':{description}}` | **AMBOS obligatorios**: `urn:ietf:params:scim:schemas:core:2.0:Group` + `urn:ietf:params:scim:schemas:extension:ibm:2.0:Group` (falta IBM → 400 CSIAI0137E) | **`isv-create-group`** (Users>Groups>Add group; `#ci-group-dialog-display-name`) | **`ISV-TPL: create-group`** id=`QsHnjeuHHXZBweMW` ✓match |

**Body canónico create-group:**
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group","urn:ietf:params:scim:schemas:extension:ibm:2.0:Group"],
  "displayName": "<groupName>",
  "urn:ietf:params:scim:schemas:extension:ibm:2.0:Group": { "description": "<groupDesc>" }
}
```

### 1.3 Usuarios

| op | method | path | body | schemas | receta engine | nodo/plantilla n8n |
|---|---|---|---|---|---|---|
| **list-users** ✅ | GET | `/v2.0/Users?attributes=userName,active&filter=userName eq "x"` | — | SCIM | — | HTTP Request GET |
| **get-user** ✅ | GET | `/v2.0/Users/{id}` / `/v2.0/Me` | — | SCIM | — | HTTP Request GET |
| **create-user** ✅ (201) | POST | `/v2.0/Users` | ver body canónico | **AMBOS**: `core:2.0:User` + `extension:ibm:2.0:User` (realm=`cloudIdentityRealm`, userCategory=`regular`) | **`isv-add-user`** (Users>Add user; `#ci-user-dialog-*`) | **`ISV-TPL: create-user`** id=`tgtDtQzx7SX8mXPy` ✓match |

**Body canónico create-user** (verificado 201 por Pike-ISV-V, `isv-dsl-templates.json`):
```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User","urn:ietf:params:scim:schemas:extension:ibm:2.0:User"],
  "userName": "<userName>",
  "name": { "givenName": "<givenName>", "familyName": "<familyName>" },
  "emails": [ { "type": "work", "value": "<email>" } ],
  "active": true,
  "urn:ietf:params:scim:schemas:extension:ibm:2.0:User": { "realm": "cloudIdentityRealm", "userCategory": "regular" }
}
```
`realm=cloudIdentityRealm` = Cloud Directory. `password` opcional (no incluido; login lo setea aparte). id en `data.id`.

### 1.4 Atributos

| op | method | path | body | receta engine | nodo n8n |
|---|---|---|---|---|---|
| **list-attributes** ✅ | GET | `/v1.0/attributes` (array; custom tienen `id`,`name`,`datatype`) | — | — | HTTP Request GET |
| **add-attribute** ✅ (201, sourceType static) | POST | `/v1.0/attributes` | ver body canónico | **`isv-add-attribute`** (UI 4 pasos; para rule-based) | **`ISV-TPL: add-attribute`** id=`3C9ZIh5IHdtGSPnE` ✓match |

**Body canónico add-attribute** (verificado 201 por Pike-ISV-V):
```json
{
  "name": "<attrName>", "description": "<description>", "scope": "global",
  "sourceType": "static", "datatype": "string", "value": "<value>",
  "displayName": "<displayName>", "tags": ["isv-dsl"]
}
```
⚠ `sourceType=static` **EXIGE `value`** (falta → 400 CSIBE2717E). Para rule-based/leído-de-fuente: `sourceType=credential(credName)` o `schema(schemaAttribute)` → requieren mapeo vía **wizard UI** (receta `isv-add-attribute`). Identificador custom en UI: **solo letras/dígitos**.

### 1.5 Identity providers (federación OIDC)

| op | method | path | body | receta engine | nodo n8n |
|---|---|---|---|---|---|
| **list-idps** ✅ | GET | `/v2.0/identitysources` (`identitySources[]`: instanceName, id, enabled, properties[]) | — | — | HTTP Request GET |
| **list-idp-types** ✅ | GET | `/v1.0/identitysourcetypes` (19 tipos) | — | — | HTTP Request GET |
| **add-oidc-idp** ✅ (201) | POST | `/v2.0/identitysources` | ver body canónico (sourceTypeId=19, properties[]) | **`isv-add-oidc-idp`** (tearsheet 6 pasos) | **`ISV-TPL: add-oidc-idp`** (N crea, id pendiente) |

**Body canónico add-oidc-idp** (verificado 201 por Pike-ISV-V; `sourceTypeId:19`=OIDC Enterprise, `properties` = array `{key,value}`):
```json
{
  "instanceName": "<idpName>", "enabled": false, "sourceTypeId": 19,
  "properties": [
    {"key":"realm","value":"<issuerUrl>"}, {"key":"friendly_name","value":"<friendlyNameSinEspacios>"},
    {"key":"client_id","value":"<clientId>"}, {"key":"client_secret","value":"<SECRETO>"},
    {"key":"scopes","value":"openid profile"}, {"key":"principalAttribute","value":"sub"},
    {"key":"supported_grant_types","value":"authorization_code"}, {"key":"pkce_support","value":"false"},
    {"key":"forward_login_hint","value":"false"}, {"key":"forward_max_age","value":"false"}, {"key":"forward_prompt","value":"false"},
    {"key":"wellknown_endpoint","value":"<wellknown>"}, {"key":"jitEnabled","value":"true"}
  ]
}
```
⚠ Props **OBLIGATORIAS** (falta→400 CSIAG0705E): `supported_grant_types, forward_max_age, forward_login_hint, forward_prompt, realm, pkce_support, client_secret, scopes, client_id`. `friendly_name` **SIN espacios** (→400 CSIAG0625E). `client_secret` = SECRETO → en n8n por **credencial**, nunca hardcode. `enabled:false` hasta validar. id (uuid) en `data.id`.

Redirect URI a entregar al IdP: **`<T>/auth/redirect`**. Targets reservados (error CSIAG0772E): `preferred_username, realmName, groupIds, uid, tenantId`.

### 1.6 Aplicaciones (Verify como IdP)

| op | method | path | body | receta engine | nodo n8n |
|---|---|---|---|---|---|
| **list-apps** ✅ | GET | `/v1.0/applications` (`_embedded.applications[]`: name, templateId, id=último seg. de `_links.self.href`) | — | — | HTTP Request GET |
| **add-oidc-app** ✅ (201) | POST | `/v1.0/applications` | ver body canónico (templateId=998) | **`isv-add-oidc-app`** (type picker `OpenID Connect`) | **`ISV-TPL: add-oidc-app`** (N crea, id pendiente) |

**Body canónico add-oidc-app** (verificado 201 por Pike-ISV-V; `templateId:"998"`, grantTypes como strings `"true"/"false"`):
```json
{
  "name": "<appName>", "templateId": "998", "type": "OpenID Connect", "description": "<description>",
  "applicationState": true, "signonState": true, "visibleOnLaunchpad": false, "approvalRequired": false,
  "providers": { "oidc": { "applicationUrl": "<applicationUrl>", "properties": {
    "grantTypes": {"authorizationCode":"true","implicit":"false","ropc":"false","clientCredentials":"false"},
    "redirectUris": ["<redirectUri>"], "idTokenSigningAlg": "RS256", "accessTokenExpiry": 3600,
    "doNotGenerateClientSecret": "false", "generateRefreshToken": "false", "consentType": "dpcm" } } }
}
```
⚠ `clientId`/`clientSecret` **se autogeneran** en save (NO enviarlos); leer luego con `GET /v1.0/applications/{id}`. `id` = último segmento de `_links.self.href`.
| **rename-app** ✅ (UI) | PUT/PATCH app | — | — | (parte de app details; `#app-name-input` + Save) | — |

### 1.7 Entitlements / acceso

| op | method | path | body | receta engine | nodo n8n |
|---|---|---|---|---|---|
| **search-entitlements** ✅ | POST | `/v1.0/entitlements/search` (app roles) | filtro | — | HTTP Request POST |
| **search-admin-entitlements** ✅ | POST | `/v1.0/admin/entitlements/search` | filtro | — | HTTP Request POST |

**Body canónico assign-group-member** (verificado 204 por Pike-ISV-V; SCIM PatchOp):
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [ { "op": "add", "path": "members", "value": [ { "value": "<userId>", "type": "user" } ] } ]
}
```
⚠ `type` **OBLIGATORIO**, solo `user`|`group` (falta→400 CSIAI0093E; inválido→400 CSIAI0097E). Éxito = **204 SIN body** (no es error; verificar con `GET /v2.0/Groups/{id}`). `op:"remove"` para desasignar. **App-level entitlement** (acceso a app) NO está en API → solo UI (tab Entitlements).
| **assign-group-member** ✅ (204) | PATCH | `/v2.0/Groups/{id}` | ver body PatchOp | **`isv-assign-entitlement`** | **`ISV-TPL: assign-entitlement`** id=`tPjRvWuC26nybz8j` ✓match |
| **assign-app-entitlement** | — (UI) | tab Entitlements de la app | NO verificada por API (wizard UI) | **`isv-assign-entitlement`** | — |

### 1.8 API clients (provisioning backend)

| op | method | path | body | receta engine | nodo n8n |
|---|---|---|---|---|---|
| **list-apiclients** ✅ (hoy total=0) | GET | `/v1.0/apiclients` | — | — | HTTP Request GET |
| **create-apiclient** | — (UI, regla 3 JANUS = lo crea Fabián) | Security>API access>Add API client | entitlements `manageUsers`+`manageGroups` (+`manageGroupMembers` si SCIM members[]) | (wizard pre-staged por Pike-ISV-V) | — |

### 1.9 Reportes (read-only)

| op | method | path | body |
|---|---|---|---|
| **report-total-logins** ✅ | POST | `/v1.0/reports/auth_total_logins` | `{FROM,TO}` |
| **report-admin-activity** ✅ | POST | `/v1.0/reports/admin_activity` | `{FROM,TO,SIZE,SORT_BY:'time',SORT_ORDER:'DESC'}` |
| **report-added-users** | POST | `/v1.0/reports/added_users_count` | `{FROM,TO}` |

---

## 2. Recetas engine.mjs añadidas (`recipes.json`)

DSL de ops (ver `engine.mjs`): `clickText, click, type, wait, waitText, waitUrl, waitSel, clickAndWaitUrl, openTabClickTile, openTabClickText`.
Valores dinámicos se pasan como `key=val` por CLI y se sustituyen en `["type", sel, "varName"]`.

| receta | start | vars | estado |
|---|---|---|---|
| `isv-create-group` | `<T>/ui/admin/users` | groupName, groupDesc | selectores verificados (tested e2e en ref) |
| `isv-add-user` | `<T>/ui/admin/users` | givenName, surname, userName, email | selectores verificados |
| `isv-add-attribute` | `<T>/ui/admin/directory/attributes` | attrName, attrDesc, attrIdentifier | selectores verificados (4 pasos) |
| `isv-add-oidc-idp` | `<T>/ui/admin/directory/identity-providers` | idpName, idpRealm, friendlyName, clientId, wellknown (+secret manual) | selectores verificados (6 pasos) |
| `isv-add-oidc-app` | `<T>/ui/admin/applications/applications` | appName, companyName, appUrl, redirectUri | selectores verificados |
| `isv-assign-entitlement` | `<T>/ui/admin/applications/applications` | appName, grantee | flujo verificado |

Ejecución: `node core/engine.mjs isv-create-group groupName="isv-dsl-group" groupDesc="demo"`.
⚠ Los `goal.textMatch` de toast son aproximados (el toast exacto no está capturado); ajustar con el toast real al primer run. Para UI con `setVal` React, el engine usa `type` (Playwright fill) que sí dispara eventos.

---

## 3. Auto-generación de workflows (el puente real)

Para generar un workflow n8n desde una op del catálogo:

1. Tomar la fila de la **tabla §1** → `method/path/body/schemas`.
2. Plantilla base **`ISV-TPL`**: `Manual Trigger → Get Token → <HTTP Request de la op>` (reusar auth `{{ $('Get Token').access_token }}` + headers SCIM/JSON de §1).
3. Para bulk: insertar `SplitInBatches` sobre el array de entrada entre `Get Token` y el HTTP Request (throttle recomendado ~5/s, dup→skip).
4. Parametrizar body con los `vars` de la receta engine equivalente (mismos nombres → trazabilidad UI↔REST↔n8n).
5. Dejar el workflow **INACTIVO** con prefijo `ISV-TPL:` hasta validación + OK de Fabián.

**Mapa op→nodo (consolidado con Pike-ISV-N):**
```
create-group       → HTTP POST /v2.0/Groups   (SCIM, 2 schemas)       → ISV-TPL: create-group       id=QsHnjeuHHXZBweMW
create-user        → HTTP POST /v2.0/Users     (SCIM)                  → ISV-TPL: create-user        id=tgtDtQzx7SX8mXPy
add-attribute      → HTTP POST /v1.0/attributes (static+value ✓201)    → ISV-TPL: add-attribute     id=3C9ZIh5IHdtGSPnE
assign-group-member→ PATCH /v2.0/Groups/{id} PatchOp add member ✓204   → ISV-TPL: assign-entitlement id=tPjRvWuC26nybz8j
add-oidc-idp       → POST /v2.0/identitysources (sourceTypeId 19) ✓201 → ISV-TPL: add-oidc-idp (N crea)
add-oidc-app       → POST /v1.0/applications   (templateId 998)  ✓201 → ISV-TPL: add-oidc-app (N crea)
bulk-provision     → Get Token → SplitInBatches → create-user xN        → ISV-TPL: bulk-provision     id=mAmxzIooQm09mZug
```

---

## 4. Pendientes / gaps a cerrar

- [x] **Bodies REST verificados** (Pike-ISV-V ^D !2, `isv-dsl-templates.json`): `create-group` ✓201, `create-user` ✓201 (ext IBM realm=cloudIdentityRealm), `create-attribute` ✓201 (static+value).
- [x] **assign-group-member verificado** (Pike-ISV-V, PATCH /v2.0/Groups/{id} PatchOp add members, `type:"user"` obligatorio, ✓204). App-level entitlement = solo UI (fuera de API).
- [x] **add-oidc-idp y add-oidc-app VERIFICADOS** (Pike-ISV-V ^D !3, ✓201): POST /v2.0/identitysources (sourceTypeId 19) y POST /v1.0/applications (templateId 998). Bodies canónicos en §1.5/§1.6. **CATÁLOGO 100% cubierto por REST.**
- [ ] **Ids ISV-TPL de add-oidc-idp/add-oidc-app**: Pike-ISV-N los crea con estos bodies; integrar ids a §1.5/§1.6 y Mapa op->nodo cuando los pase.
- [x] **`isv-catalog.json` integrado** (Pike-ISV-V, 177KB, 18 endpoints, secretos redactados): users=2, groups=8, apps=2, identitysources=3, attributes=61, policies=18, apiclients=0, admin_roles=9. Recursos de prueba creados: group `isv-dsl-group`(8A500033P2), user `isv-dsl-user`(8A40002O72), attr `isvDslAttr`(98800b6f-...fdd3) — DELETE en §5.
- [x] **Ids `ISV-TPL:*` integrados** (Pike-ISV-N, inventario `janus/isv-n8n-inventory.json`, todos INACTIVOS, cred httpCustomAuth `lRgURi90b9DGfmjD`, 5/5 revalidados 0err/0warn): create-group `QsHnjeuHHXZBweMW`, create-user `tgtDtQzx7SX8mXPy`, add-attribute `3C9ZIh5IHdtGSPnE`, bulk-provision `mAmxzIooQm09mZug`, assign-entitlement `tPjRvWuC26nybz8j` (provisional, PATCH Groups/{id} add members — a confirmar con hook fetch de V).
- [ ] **manageGroupMembers**: si el provisioning vincula user↔group (members[] en SCIM), el API client necesita además la entitlement "Manage all groups and their members".
- [ ] **Confirmar toasts de éxito** de cada receta UI para fijar `goal.textMatch`.

---

## 5. Archivos del catálogo DSL

- `C:/Users/fabia/pike-web/recipes.json` — recetas engine (UI).
- `C:/Users/fabia/pike-web/engine.mjs` — intérprete del DSL.
- `C:/Users/fabia/pike-web/janus/ref-ibm-verify-admin.md` — mapa API + selectores verificados (fuente).
- `C:/Users/fabia/pike-web/janus/isv-catalog.json` — catálogo exhaustivo del tenant (Pike-ISV-V, 177KB, secretos redactados). ✅
- `C:/Users/fabia/pike-web/janus/isv-dsl-templates.json` — plantillas REST verificadas (create-group/user/attribute, bodies exactos). ✅
- `C:/Users/fabia/pike-web/janus/isv-dsl-spec.md` — este puente op→REST→receta→n8n.

### Recursos de prueba a borrar (Fabián)
```
DELETE /v2.0/Groups/8A500033P2                              # isv-dsl-group
DELETE /v2.0/Users/8A40002O72                               # isv-dsl-user
DELETE /v1.0/attributes/98800b6f-a641-4624-a650-9d6c9793fdd3 # isvDslAttr
DELETE /v1.0/applications/1575943302248883312               # isv-dsl-oidc-app
DELETE /v2.0/identitysources/e4071a86-996f-4157-a5ec-31cb6f527f8c # isv-dsl-oidc-idp (enabled:false, secreto dummy)
# membership isv-dsl-user->isv-dsl-group se borra al eliminar el grupo
```

---

## 6. Simulación de logins masivos (2 carriles)

Tenant soporta grant `password` (ROPC) ✅ (verificado en /oauth2/.well-known/openid-configuration; grants: authorization_code, implicit, password, client_credentials, policyauth, device_code, ...).

| carril | script | método | para qué | requisitos |
|---|---|---|---|---|
| **api-ropc** ⚡ | `simulate-logins-ropc.mjs` · n8n **ISV-TPL: simulate-logins** id=`in93aKOtq3cAR1R5` (cred ROPC `UDOahacpStSXHeZh`, batch=5=throttle, onError=continue) | POST `/oauth2/token` grant=password por usuario (concurrencia+throttle) | poblar métricas/demo, smoke de credenciales, carga ligera-media | app OIDC con grant `password`; usuarios con password; creds por ENV ROPC_CLIENT_ID/SECRET |
| **web-authcode** | `simulate-logins-web.mjs` | Playwright/CDP: /oauth2/authorize → login Cloud Directory → consent → code | validar UX/MFA/políticas reales | Chrome CDP; app OIDC authorization_code + redirect; selectores login = DRAFT |

Entrada ambos: JSON `[{username,password}]`. Cada login ROPC/web = evento REAL → ver `POST /v1.0/reports/auth_total_logins {FROM,TO:"now"}` o dashboard. ROPC puede fallar si una política fuerza MFA (usar grant policyauth o el carril web).
