# Trocora App — Contexto del proyecto

App móvil de intercambio y compraventa de cartas de TCG (Pokémon, Magic, Yu-Gi-Oh!, One Piece, Digimon, Lorcana). Solo móvil — no hay versión web activa.

## Reglas del agente

- **No mencionar al asistente en ningún lado.** En commits, código, comentarios, PRs y mensajes al usuario no incluir frases como "Co-Authored-By: Claude", "Generated with Claude", ni referencias similares. Los commits van firmados solo por el autor humano.
- **No hacer push a git ni publicar updates / builds sin instrucción explícita.** Eso incluye `git push`, `eas update`, `eas build`, `eas submit`, `npm publish`, deploys de edge functions a producción, y cualquier otra acción que afecte usuarios reales o repositorios remotos. Preparar el commit local está bien; publicarlo no, hasta que el usuario lo pida.

## Stack

- **Expo Router** (file-based routing, SDK 54) + **React Native 0.81** + **TypeScript**
- **Supabase** para auth, base de datos (Postgres con RLS), Realtime, Edge Functions y Storage
- **Expo Notifications** (push) — requiere dev build, no funciona en Expo Go
- `expo-image`, `expo-image-picker`, `expo-location`, `react-native-maps`, `react-native-safe-area-context`

## Estructura

```
app/
  (auth)/           # Login / signup
  (tabs)/
    collection/     # Mi colección, folders, agregar cartas
    explorar/       # Explorar cartas de otros usuarios (entry point a los trades)
    intercambios/   # Lista de trades del usuario
    profile/
  intercambio/      # Detalle [id] (chat) y alta (nueva) de un trade — fuera de (tabs)
  _layout.tsx       # RootNavigator: redirige según session, registra push token
context/AuthContext.tsx
lib/
  supabase.ts                       # Cliente Supabase con AsyncStorage
  usePushTokenRegistration.ts       # Hook que upsertea Expo push token
  DateTimePicker.tsx                # Pickers reutilizables
  AppDialog.tsx                     # Modal de diálogo temático (reemplaza Alert nativos)
  enabledGames.ts, cardPrice.ts, theme.ts
types/database.ts                   # Interfaces TS + Database type para supabase-js
migrations/                         # SQL plano, una sentencia o conjunto idempotente por archivo
supabase/functions/notify/index.ts  # Edge function para push (webhooks de INSERT)
```

## Tema visual

Dark mode fijo. Paleta principal:
- Fondo: `#0F172A` (slate-900)
- Cards/inputs: `#1E293B` (slate-800)
- Borders: `#334155` (slate-700)
- Primary: `#6366F1` (indigo-500)
- Success: `#22C55E` / `#4ADE80` · Warning: `#FACC15` / `#FB923C` · Danger: `#EF4444`
- Texto: `#F1F5F9` (slate-100) primary, `#94A3B8` secondary, `#64748B` muted

## Convenciones de código

- Estilos con `StyleSheet.create` al final del archivo
- Iconos con `@expo/vector-icons` Ionicons, tipo `IoniconName` cuando es polimórfico
- Strings de UI en español (registro neutro)
- Para Alerts: preferir `AppDialog` de `lib/AppDialog.tsx` antes que `Alert` nativo
- Imports con alias `@/` apuntando a la raíz del proyecto
- Comentarios mínimos; no documentar lo obvio
- File-based routing de Expo Router — el `name` del `Tabs.Screen` debe coincidir con el nombre del folder

## Base de datos

Project ref de Supabase: `ujcwxvzesjtmzcpyvqdo`. RLS está habilitado en todas las tablas públicas.

Tablas principales:
- `profiles` — usuarios (FK a `auth.users`)
- `cards_collection` — inventario por usuario, publicable con `is_published` (disponibilidad). El modo trade/venta se acuerda en el chat vía `meetups.kind`
- `collection_folders` — agrupación por usuario
- `meetups` — núcleo de los trades. Status: `pending` → `countered` → `confirmed` → `completed` / `cancelled`. `scheduled_at`, `custom_location`, `agreed_price` son **nullable** porque se acuerdan en chat
- `meetup_cards` — N:N de cartas en un meetup, con `side: 'proposer' | 'receiver'`
- `meetup_ratings` — feedback post-encuentro
- `safe_zones` — lugares verificados sugeridos
- `messages` — chat in-app por meetup, inmutable (sin UPDATE/DELETE policy), expuesto vía Realtime
- `push_tokens` — Expo push tokens por usuario, único por token, RLS solo permite ver/editar los propios
- `user_blocks` — bloqueos entre usuarios (`blocker_id` bloquea a `blocked_id`, direccional). RLS: cada quien ve/inserta/borra solo los propios
- `user_reports` — reportes de usuarios para moderación (`reason`, `status`, `meetup_id` opcional). RLS: insert/select propios
- Tablas catálogo: `pokemon_sets/cards`, `magic_sets/cards` + price history

RPC:
- `transfer_trade_cards(p_meetup_id uuid)` — al hacer check-in ambos, mueve `cards_collection.user_id` de las cartas según `meetup_cards.side`. SECURITY DEFINER con guard de participantes.

## Migrations

Archivos SQL planos en `migrations/`, nombrados `YYYY_MM_<descripcion>.sql`. Idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.). Se aplican vía:
- Supabase MCP `apply_migration` cuando hay sesión MCP activa
- Manualmente en Supabase SQL editor cuando no

## Flujo de trade actual

1. Usuario A toca una carta en **Explorar** → modal con detalle → "Proponer encuentro"
2. `intercambio/nueva.tsx` (pantalla lineal): la carta inicial viene pre-seleccionada, A puede agregar más cartas del mismo dueño + tipo (trade/purchase) + nota → envía
3. Edge function `notify` dispara push al receiver
4. Receiver abre el trade → ve **chat in-app con Realtime** y los detalles arriba
5. Cualquiera abre "Modificar propuesta" → ajusta cartas, precio, **fecha**, **hora**, **lugar** → `status: countered`
6. Receiver aprieta "Aceptar" → `status: confirmed` (queda cerrado, no se puede editar)
7. Hasta 6h antes del encuentro: candado visible bloqueando check-in
8. El día: ambos hacen check-in → RPC `transfer_trade_cards` → `status: completed`
9. Calificación opcional post-encuentro

## Push notifications

- Edge function `notify` deployada en `https://ujcwxvzesjtmzcpyvqdo.supabase.co/functions/v1/notify`
- Configurada con dos Database Webhooks (Supabase Dashboard): INSERT a `meetups` y INSERT a `messages`
- `verify_jwt: false` — la function valida un header `x-webhook-secret` si la env var `WEBHOOK_SECRET` está seteada
- En el cliente: `usePushTokenRegistration(user?.id)` se llama desde `RootNavigator`. Skipea simulador (`!Device.isDevice`)

## Notas y problemas conocidos

- Hay un problema sistémico con los tipos generados de Supabase: muchos inserts/updates muestran error `TS2345 — not assignable to parameter of type 'never'`. No es un bug real, es desincronización del tipo `Database` con el schema actual. Para arreglarlo de raíz se puede regenerar `types/database.ts` con `mcp__supabase__generate_typescript_types`
- Push notifications requieren build de EAS (`eas build --profile development`). Expo Go no las soporta
- `app.json` declara plugin `web` por bundler pero no es un target activo
