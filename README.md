# Area Leader Pro

Plataforma web de gestión de proyectos diseñada para líderes de área. Permite gestionar proyectos, equipos, tareas, riesgos y reportes en tiempo real, con exportación PDF ejecutiva personalizable por cliente.

**Demo en vivo:** [angulodev.github.io/leader_pro](https://angulodev.github.io/leader_pro/)

---

## Índice

1. [Stack tecnológico](#stack-tecnológico)
2. [Funcionalidades](#funcionalidades)
3. [Rutas de la aplicación](#rutas-de-la-aplicación)
4. [Estructura del proyecto](#estructura-del-proyecto)
5. [Instalación local](#instalación-local)
6. [Configuración de Supabase](#configuración-de-supabase)
7. [Schema completo de base de datos](#schema-completo-de-base-de-datos)
8. [Variables de entorno](#variables-de-entorno)
9. [Personalización de usuario](#personalización-de-usuario)
10. [Exportación de reportes PDF](#exportación-de-reportes-pdf)
11. [Deploy en producción](#deploy-en-producción)
12. [CI/CD con GitHub Actions](#cicd-con-github-actions)
13. [Planes y monetización](#planes-y-monetización)
14. [Flujo de upgrade de plan](#flujo-de-upgrade-de-plan)

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Router | React Router v6 (con soporte SPA en GitHub Pages) |
| Base de datos | Supabase (PostgreSQL 17) |
| Iconos | Material Symbols Rounded (Google Fonts, variable font) |
| Tipografía | Inter (Google Fonts) |
| Estilos | CSS custom con design tokens (sin framework CSS) |
| Deploy | GitHub Pages via GitHub Actions (peaceiris/actions-gh-pages) |

---

## Funcionalidades

### Dashboard
- KPIs ejecutivos clickeables: proyectos totales, riesgos activos, capacidad del equipo, progreso general
- Gráfico de barras SVG (progreso real vs estimado) — funciona en todos los tamaños de pantalla
- Lista de riesgos críticos con etiquetas de desviación de tiempo/costo
- Feed de actividad reciente del equipo
- Botón de exportación rápida

### Proyectos
- CRUD completo: crear, editar y eliminar proyectos
- 6 estados visuales con selector tipo lista: Backlog · Planificación · En desarrollo · En riesgo · En pausa · Completado
- Sliders de progreso real vs estimado
- Filtros por estado y búsqueda por nombre/cliente
- Métricas de resumen en tiempo real (total, progreso prom., en riesgo, on track)
- Navegación directa al detalle desde la tabla
- Banner de aviso cuando el usuario está cerca o en el límite de proyectos de su plan
- Modal de upgrade al intentar crear un proyecto que excede el límite del plan actual (ver [Flujo de upgrade de plan](#flujo-de-upgrade-de-plan))

### Detalle de Proyecto — 4 tabs

**Overview**
- Descripción editable con link directo al editor
- Barras de progreso real vs estimado
- Resumen visual de tareas recientes con estado semafórico
- Panel lateral de actividad y comentarios con **fecha y hora exacta**

**Tareas**
- CRUD completo con modal: título, grupo/fase, estado, asignado, fecha límite
- Flujo de eliminación protegido:
  1. Al tocar eliminar aparece modal de confirmación con 3 opciones
  2. **Marcar como completada** — cambia estado directamente
  3. **Mover a Pendiente (borrador)** — si la tarea no está en `todo`
  4. **Eliminar permanentemente** — solo disponible si la tarea ya está en estado `Pendiente`
- Toast de confirmación tras cada acción

**Riesgos**
- CRUD completo: título, descripción, severidad (Alto/Medio/Bajo como lista visual), impacto en tiempo y costo
- Cards con color semafórico por severidad y fecha de registro

**Equipo**
- Grid visual de todas las personas del equipo
- Asignar/desasignar con un toque — persiste en tabla `project_members`
- Badge "Asignado" / "+ Asignar" con indicador visual inmediato

### Equipo
- CRUD de personas: nombre, iniciales, rol, email, color de avatar
- Estado Activo/Inactivo como lista visual en el modal de edición (soft delete — preserva integridad referencial)
- Confirmación antes de cambiar estado + toast de resultado
- Toggle para mostrar/ocultar personas inactivas
- Tabla + tarjetas, toda la tarjeta es clickeable para editar

### Carga de Trabajo
- Mapa de calor semanal con navegación real (← →) entre semanas
- Carga dinámica desde Supabase para cada semana seleccionada
- Indicadores de utilización por persona con alertas de sobrecarga
- Distribución de horas por proyecto con barras proporcionales correctas

### Reportes
- 4 KPIs ejecutivos con datos reales de Supabase
- Gráfico de barras SVG: progreso real vs estimado por proyecto
- Donuts de distribución: estados de proyectos y tareas (responsive mobile)
- Sparkline de actividad del equipo (selector 7/14/30 días)
- Carga del equipo: proyectos y tareas por persona con alertas de bloqueo
- Botón de actualización manual

### Notificaciones
- Panel desplegable con actividad en tiempo real
- Contador de no leídas en el ícono (hasta 9+)
- Marcar como leída individual o todas
- Estado persistido en `localStorage`
- En mobile: panel de ancho completo desde el topnav

### Exportación PDF
- Accesible desde: sidebar, bottom nav, Dashboard y pantalla de Proyectos
- Selector de proyectos con semáforo y progreso visible antes de seleccionar
- Toggle "Seleccionar todos" / "Quitar todos"

**Tipos de reporte:**
- **Vista global:** portada + semáforo de salud + tabla resumen + riesgos consolidados + próximos hitos (30 días)
- **Reporte completo:** todo lo anterior + una página de detalle por proyecto (tareas, riesgos, equipo)

**Perfiles de cliente (estilos guardados):**
- Nombre del estilo y del cliente
- 3 colores de marca con color picker nativo
- Tipografía seleccionable (6 opciones)
- Logo/sigla y pie de página personalizado
- Toggles: portada ejecutiva, riesgos consolidados, próximos hitos
- Persisten en `localStorage` — reutilizables entre sesiones
- Crear, editar y eliminar perfiles

**El PDF incluye:**
- Portada ejecutiva con colores del cliente, salud del portafolio y autor
- Indicador de salud global (score 0–100 con color semafórico)
- Tabla resumen con semáforo, estado, progreso vs estimado, desviación, líder y riesgos altos
- Riesgos consolidados ordenados por severidad
- Próximos hitos (tareas que vencen en 30 días)
- Detalle por proyecto: progreso, equipo, tareas y riesgos

### Perfil y Personalización de Usuario
Accesible desde el avatar en el topnav o en el fondo del sidebar:

**Perfil:** nombre, cargo, email y color de avatar (persiste en `localStorage`)

**6 temas visuales** (se aplican en tiempo real con CSS custom properties):
| Tema | Descripción |
|------|-------------|
| Océano | Azul marino clásico (por defecto) |
| Pizarra | Gris profesional con acento índigo |
| Esmeralda | Verde corporativo |
| Rosa | Moderno y vibrante |
| Oscuro | Modo noche completo |
| Violeta | Creativo con acento púrpura |

**Ajustes:**
- Compactar tablas (reduce padding para ver más contenido)
- Sidebar abierto por defecto en desktop
- Limpiar preferencias (restaura tema y datos locales)

---

## Rutas de la aplicación

| Ruta | Pantalla |
|------|---------|
| `/leader_pro/` | Dashboard |
| `/leader_pro/projects` | Cartera de proyectos |
| `/leader_pro/projects/:id` | Detalle de proyecto (carga desde Supabase si se recarga) |
| `/leader_pro/team` | Gestión de equipo |
| `/leader_pro/workload` | Carga de trabajo |
| `/leader_pro/reports` | Reportes y analytics |
| `/leader_pro/settings` | Configuración (próximamente) |

> **SPA routing en GitHub Pages:** al recargar cualquier ruta, GitHub Pages sirve `404.html` (copia de `index.html`). React Router toma el control y renderiza la pantalla correcta. El proyecto se recarga desde el ID en la URL sin perder el contexto.

---

## Estructura del proyecto

```
area-leader-pro/
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx        # KPIs, gráfico SVG, riesgos, actividad
│   │   ├── Projects.jsx         # Cartera con filtros, tabla y exportación
│   │   ├── ProjectDetail.jsx    # Tabs: overview, tareas, riesgos, equipo
│   │   ├── ProjectModal.jsx     # Modal crear/editar proyecto con selector de estado
│   │   ├── UpgradePlanModal.jsx # Modal de límite de plan + solicitud de upgrade
│   │   ├── PlanLimitBanner.jsx  # Aviso de cercanía/límite de plan en Proyectos
│   │   ├── ExportModal.jsx      # Exportador PDF con perfiles de cliente
│   │   ├── Team.jsx             # Gestión de equipo con soft delete
│   │   ├── Workload.jsx         # Mapa de calor con navegación semanal real
│   │   ├── Reports.jsx          # Reportes con gráficos SVG y donuts
│   │   ├── Notifications.jsx    # Panel de notificaciones con conteo
│   │   ├── UserPanel.jsx        # Perfil, temas y ajustes de usuario
│   │   └── UI.jsx               # Componentes compartidos (Avatar, StatusTag, etc.)
│   ├── lib/
│   │   ├── supabase.js          # Cliente Supabase + todas las queries y RPCs (incluye getPlanStatus/requestUpgrade)
│   │   └── clientStyles.js      # Gestión de perfiles de estilo para PDF
│   ├── App.jsx                  # Shell con React Router, layout y navegación
│   ├── index.css                # Design system completo (tokens, dark mode, responsive)
│   └── main.jsx                 # Entry point React
├── supabase/
│   └── migrations/
│       ├── 001_full_schema.sql              # Schema completo para instalar desde cero
│       └── 20260617_subscriptions_upgrade_flow.sql  # Tabla subscriptions + RPC al_request_upgrade
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD: build + copy 404.html + deploy a GitHub Pages
├── .env.example                 # Template de variables de entorno
├── vite.config.js               # Config Vite (base: /leader_pro/)
└── README.md
```

---

## Instalación local

### Requisitos
- Node.js 18 o superior
- npm 9 o superior
- Cuenta en [Supabase](https://supabase.com) (plan gratuito funciona)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/angulodev/leader_pro.git
cd leader_pro

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# 4. Aplicar el schema en Supabase
# Ir al SQL Editor de tu proyecto y ejecutar:
# supabase/migrations/001_full_schema.sql

# 5. Correr en modo desarrollo
npm run dev
# La app estará en http://localhost:5173/leader_pro/
```

---

## Configuración de Supabase

### 1. Crear proyecto

1. Ir a [supabase.com](https://supabase.com) → New project
2. Elegir nombre, contraseña y región
3. Esperar ~2 minutos

### 2. Obtener credenciales

**Settings → API:**
- **Project URL:** `https://TU_ID.supabase.co`
- **anon/public key:** clave que empieza con `eyJ...`

### 3. Aplicar el schema

**SQL Editor → New query** → pegar y ejecutar, en este orden:
1. `supabase/migrations/001_full_schema.sql` — schema base, proyectos, equipo, tareas, riesgos
2. `supabase/migrations/20260617_plans_and_subscriptions.sql` — catálogo de planes, plan por usuario, tabla `subscriptions` y RPCs del flujo de upgrade

El schema crea automáticamente:
- Schema `area_leader` con todas las tablas
- Vistas públicas para PostgREST (`al_*`)
- Funciones RPC para escritura (`SECURITY DEFINER`)
- Políticas RLS

> **Nota sobre PostgREST:** por defecto solo expone el schema `public`. Por eso todas las lecturas usan vistas en `public` que apuntan a `area_leader`, y todas las escrituras usan funciones RPC también en `public`.

> Las tablas `plans` y `user_plans` (catálogo de planes y plan activo por usuario) se versionan en `supabase/migrations/20260617_plans_and_subscriptions.sql`, junto con `subscriptions`. No estaban en `001_full_schema.sql` originalmente — fueron creadas después directamente en la base y se versionan recién en esta migración.

---

## Schema completo de base de datos

### Tablas (schema `area_leader`)

| Tabla | Descripción |
|-------|-------------|
| `team_members` | Personas del equipo. Campo `active` para soft delete |
| `projects` | Proyectos con estado, progreso real/estimado y líder |
| `project_members` | Relación many-to-many proyectos ↔ miembros |
| `tasks` | Tareas por proyecto con asignación y estado |
| `risks` | Riesgos con severidad (high/medium/low) e impacto |
| `activity` | Feed de eventos: comentarios, estados, hitos |
| `workload` | Horas asignadas por persona/día/semana/proyecto |

> Las tablas de planes (`plans`, `user_plans`, `subscriptions`) viven directamente en el schema `public`, no en `area_leader` — son del sistema de monetización, no de gestión de proyectos. Detalle completo en [Planes y monetización](#planes-y-monetización).

### Estados válidos

**Proyectos:** `backlog` · `planning` · `active` · `at-risk` · `on-hold` · `completed`

**Tareas:** `todo` · `in-progress` · `review` · `blocked` · `completed`

### Vistas públicas (`public`)

| Vista | Descripción |
|-------|-------------|
| `al_team_members` | Miembros activos únicamente |
| `al_team_members_all` | Todos los miembros (incluye inactivos) |
| `al_projects` | Proyectos con datos del líder embebidos |
| `al_tasks` | Tareas con datos del asignado |
| `al_risks` / `al_risks_by_project` | Riesgos con nombre del proyecto |
| `al_activity` | Actividad con actor y proyecto |
| `al_workload` | Carga con datos de miembro y proyecto |
| `al_project_members` | Miembros asignados a cada proyecto |

> La sección "Proyectos activos" del sidebar muestra proyectos con estado `active`, `at-risk` o `planning`, ordenados por última actualización. Se recarga automáticamente al iniciar la app.

### Funciones RPC (`public`)

| Función | Operación |
|---------|-----------|
| `al_upsert_member(...)` | Crear/editar miembro (incluye campo `active`) |
| `al_deactivate_member(id)` | Soft delete |
| `al_activate_member(id)` | Reactivar |
| `al_upsert_project(...)` | Crear/editar proyecto |
| `al_delete_project(id)` | Eliminar con cascada (activity, risks, tasks, workload) |
| `al_add_project_member(project_id, member_id)` | Asignar persona al proyecto |
| `al_remove_project_member(project_id, member_id)` | Desasignar |
| `al_upsert_task(...)` | Crear/editar tarea |
| `al_delete_task(id)` | Eliminar tarea |
| `al_upsert_risk(...)` | Crear/editar riesgo |
| `al_delete_risk(id)` | Eliminar riesgo |
| `al_add_activity(...)` | Registrar comentario o evento |
| `al_report_summary()` | KPIs para dashboard de reportes |
| `al_report_progress()` | Progreso vs estimación por proyecto |
| `al_report_activity(days)` | Actividad agrupada por día |
| `al_report_team_load()` | Carga de trabajo por miembro |

---

## Variables de entorno

```env
# .env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

El archivo `.env` está en `.gitignore`. Para producción, configurar como **Repository Secrets** en GitHub:
`Settings → Secrets and variables → Actions → New repository secret`

---

## Personalización de usuario

Todas las preferencias se guardan en `localStorage` bajo la clave `alp_user_prefs`:

```json
{
  "name": "Francisco A.",
  "role": "Area Leader",
  "email": "francisco@empresa.cl",
  "color": "#1e293b",
  "themeId": "dark",
  "compact": false,
  "sidebarOpen": true
}
```

Los perfiles de estilo para PDF se guardan bajo `alp_client_styles`.
Las notificaciones leídas se guardan bajo `alp_read`.

---

## Exportación de reportes PDF

El exportador genera un HTML completo y abre el diálogo de impresión del navegador:

```
Abrir modal → Seleccionar tipo → Elegir proyectos → Seleccionar estilo de cliente → Exportar PDF
                                                                                          ↓
                                                                          Ventana con HTML del reporte
                                                                                          ↓
                                                                          Diálogo de impresión del OS
                                                                                          ↓
                                                                              Guardar como PDF
```

**En mobile (iOS/Android):** Compartir → Imprimir → Guardar como PDF

Los colores y fondos se imprimen correctamente gracias a `-webkit-print-color-adjust: exact`.

---

## Deploy en producción

### GitHub Pages (configuración actual)

Deploy automático en cada push a `main`. El workflow:
1. Instala dependencias con `npm ci`
2. Compila con Vite inyectando los secrets de Supabase
3. Copia `dist/index.html` → `dist/404.html` (routing SPA)
4. Despliega con `peaceiris/actions-gh-pages` al branch `gh-pages`

**URL:** `https://angulodev.github.io/leader_pro/`

> Si cambias el nombre del repo, actualizar `base` en `vite.config.js` y `basename` en el `BrowserRouter` de `App.jsx`.

### Vercel / Netlify

```bash
# Build command
npm run build

# Output directory
dist

# Variables de entorno
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Para Netlify agregar un archivo `public/_redirects`:
```
/* /index.html 200
```

### Self-hosted (nginx)

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

---

## CI/CD con GitHub Actions

```yaml
# .github/workflows/deploy.yml
# Push a main → build → copy 404.html → deploy a gh-pages
```

El deploy tarda aproximadamente **30–45 segundos** desde el push hasta que el sitio se actualiza.

---

## Desarrollo

```bash
npm run dev      # Servidor de desarrollo con HMR
npm run build    # Build de producción
npm run preview  # Preview del build local
```

---

## Licencia

MIT — Angulodev · Francisco Angulo · [github.com/angulodev/leader_pro](https://github.com/angulodev/leader_pro)

---

## Planes y monetización

Area Leader Pro incluye un sistema de planes por usuario. Cada nuevo usuario recibe automáticamente el plan **Básico** (gratis) al registrarse, vía trigger en Supabase.

| Plan | ID | Precio CLP | Proyectos |
|------|-----|-----------|-----------|
| Básico | `basic` | Gratis | 1 |
| Inicial | `starter` | $5.990/mes | 3 |
| Pro | `pro` | $10.990/mes | 10 |
| Avanzado | `advanced` | $29.990/mes | 30 |
| Ultra | `ultra` | $45.990/mes | 50 |
| Enterprise | `enterprise` | $89.990/mes | 100 + BD dedicada |

### Tablas de planes

- `public.plans` — catálogo de planes con precio y límite de proyectos. Sin RLS (es un catálogo), pero con grants restringidos a solo `SELECT` para `anon`/`authenticated` — nadie puede insertar, editar ni borrar planes desde el cliente.
- `public.user_plans` — plan activo de cada usuario. RLS: cada usuario ve solo el suyo (`user_id = auth.uid()`). Grant de tabla limitado a `SELECT`; la escritura solo ocurre vía el trigger `handle_new_user_plan` o por admin SQL directo.
- `public.subscriptions` — historial de solicitudes/ciclos de suscripción. RLS por usuario. Grant limitado a `SELECT` + `INSERT` para `authenticated`. Ver [Flujo de upgrade de plan](#flujo-de-upgrade-de-plan).

### Funciones RPC relacionadas

| Función | Operación |
|---------|-----------|
| `al_get_my_plan()` | Retorna plan actual (id, nombre, precio, límite) + proyectos activos del usuario |
| `al_plan_status()` | Retorna el estado completo del plan: actual, consumo, `near_limit`/`at_limit` y el `next_plan` sugerido. Es lo que consume `PlanLimitBanner` y `UpgradePlanModal` en el frontend |
| `al_can_create_project()` | Retorna `true`/`false` según si el usuario puede crear un proyecto más dentro de su límite |
| `al_request_upgrade(plan_id)` | Registra una solicitud de upgrade en `subscriptions` con estado `pending`. No activa el plan — eso ocurre cuando se confirme el pago (ver abajo) |

Trigger `on_auth_user_plan` (en `auth.users`, ejecuta `handle_new_user_plan()`) — asigna el plan `basic` automáticamente al registrarse.

`al_upsert_project(...)` lanza la excepción `project_limit_reached` cuando el usuario intenta crear un proyecto excediendo el límite de su plan. El frontend (`lib/supabase.js`) detecta ese mensaje, consulta `al_plan_status()` y dispara el modal de upgrade en lugar de mostrar un error genérico.

### Cómo cambiar el plan de un usuario manualmente (admin SQL)

```sql
UPDATE public.user_plans
SET plan_id = 'pro'
WHERE user_id = 'UUID_DEL_USUARIO';
```

---

## Flujo de upgrade de plan

Cuando un usuario alcanza el límite de proyectos de su plan, el flujo es:

1. **Intento de crear proyecto** → `al_upsert_project` detecta que `al_can_create_project()` es `false` y lanza `project_limit_reached`.
2. **Frontend captura el error** en `upsertProject()` (`lib/supabase.js`), consulta `al_plan_status()` y propaga un error con `code: 'PLAN_LIMIT_REACHED'` y el detalle del plan.
3. **`ProjectModal`** reemplaza el formulario por **`UpgradePlanModal`**, mostrando el plan actual, el consumo y el plan siguiente recomendado (`next_plan`).
4. El usuario confirma con "Quiero subir a [plan]" → se llama `al_request_upgrade(plan_id)`, que inserta una fila en `public.subscriptions` con `status = 'pending'`.
5. El modal confirma que la solicitud quedó registrada. **El plan todavía no se activa en este punto.**

Adicionalmente, **`PlanLimitBanner`** se muestra en la pantalla de Proyectos cuando el usuario está cerca (`near_limit`) o ya en el límite (`at_limit`), sin esperar a que intente crear un proyecto.

> **Nota de seguridad (2026-06-17):** al crear `plans`/`user_plans`/`subscriptions`, Supabase otorga por defecto `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` a `anon` y `authenticated` en tablas nuevas del schema `public`. Se detectó y corrigió: `plans` quedó en solo lectura pública, y `user_plans`/`subscriptions` quedaron con grants mínimos (`SELECT`, y `INSERT` solo en `subscriptions`), dependiendo de las funciones `SECURITY DEFINER` para cualquier escritura real. La migración versionada en este repo ya incluye estos `revoke` desde el inicio.

### Estado actual: pago real pendiente de integrar

El esquema de `subscriptions` está diseñado para ser **agnóstico del proveedor de pago**:

```sql
-- public.subscriptions
id                          uuid
user_id                      uuid
plan_id                      text        -- referencia a plans.id
status                       text        -- pending | active | past_due | cancelled
provider                     text        -- null hasta integrar (ej. 'mercadopago', 'stripe')
provider_subscription_id     text        -- id externo del proveedor una vez creado el checkout
current_period_start         timestamptz
current_period_end           timestamptz
```

Aún **no hay proveedor de pago decidido ni integrado**. Falta, en este orden:

1. Elegir proveedor (candidato evaluado: Mercado Pago, por cobro en CLP y soporte de suscripciones recurrentes vía `preapproval`).
2. Crear una Edge Function que reciba el webhook del proveedor y, al confirmar el pago, actualice `subscriptions.status = 'active'` y `user_plans.plan_id`.
3. Conectar `UpgradePlanModal` al checkout real del proveedor en vez del registro de solicitud `pending` actual.
4. Manejar renovación mensual y `past_due` / `cancelled` cuando falle un cobro.

---

## Landing page de marketing

El directorio `/marketing/` contiene la landing page de venta:

**URL local:** `marketing/index.html` (abrir directamente en el browser)

**Secciones:**
- Hero con propuesta de valor y acceso directo a la demo
- Funcionalidades principales (6 cards)
- Vista previa interactiva de la app
- Cómo funciona (4 pasos)
- Tabla de precios completa con los 6 planes
- Testimonios
- CTA final con registro

**Links:** todos los CTAs apuntan a `https://angulodev.github.io/leader_pro/`

**Deploy sugerido:** subir `marketing/index.html` a GitHub Pages, Netlify o Vercel como sitio estático independiente.

---

## Login empresarial

El login incluye:
- Panel izquierdo de branding con propuesta de valor y features
- Panel derecho con formulario
- Tabs: Iniciar sesión / Crear cuenta
- Login con Google OAuth
- Email + contraseña
- Barra de demo rápida (rellena credenciales con un clic)
- Link a la landing de precios
- Responsive: en mobile el panel de branding se compacta
