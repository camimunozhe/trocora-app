# Trocora Web — Context Document

Este archivo es el **handoff completo** para construir el sitio web de marketing de Trocora en un repo aparte (`~/code/trocora-web/`). Contiene todo lo que se necesita saber: producto, marca, copy, features, pricing, requisitos legales y reglas de trabajo.

Copialo al nuevo repo como `CONTEXT.md` o `BRIEF.md` cuando empieces.

---

## 1. Qué es Trocora

App móvil de **intercambio y compraventa de cartas TCG** (Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Digimon, Lorcana). Permite a coleccionistas:

- Gestionar su colección (carpetas, condiciones, precios estimados)
- Publicar cartas para trade o venta
- Descubrir cartas de otros usuarios cerca (por región)
- Coordinar encuentros con chat in-app y check-in mutuo
- Hacer trades seguros con sistema de check-in dual + transferencia de propiedad automática

**Plataformas activas**: solo iOS y Android (no hay versión web de la app).

**Stack mobile**: Expo SDK 54, React Native 0.81, TypeScript, Supabase (auth, Postgres, Realtime, Storage, Edge Functions), RevenueCat para suscripciones.

**Mercado objetivo inicial**: hispanohablantes (México, Chile, Argentina, Colombia, España). Idioma único de momento: español neutro de México (con "tú", sin voseo).

---

## 2. Brand identity

### Paleta (dark mode obligatorio en la app, recomendado heredarlo al web)

| Rol | Hex | Uso |
|---|---|---|
| Fondo principal | `#0F172A` (slate-900) | Background page |
| Cards / surfaces | `#1E293B` (slate-800) | Cards, sections elevadas |
| Borders | `#334155` (slate-700) | Dividers, outlines |
| Primary brand | `#6366F1` (indigo-500) | CTAs principales, accent |
| Success | `#22C55E` / `#4ADE80` | Confirmaciones, badges Pro |
| Warning | `#FACC15` / `#FB923C` | Badges, alerts |
| Danger | `#EF4444` | Errores, destructivas |
| Texto primary | `#F1F5F9` (slate-100) | Headlines, body |
| Texto secondary | `#94A3B8` (slate-400) | Subcopy, captions |
| Texto muted | `#64748B` (slate-500) | Labels, footnotes |

### Tipografía

La app usa el sistema (System / SF Pro en iOS, Roboto en Android). Para el web sugiero:

- **Display / Headings**: Inter o Geist (uno u otro)
- **Body**: misma que headings
- **Mono** (solo si lo necesitás): JetBrains Mono o Geist Mono

### Voz y tono

- **Idioma**: español neutro de México (referencia: `~/.claude/projects/.../memory/language_neutral_mx_spanish.md`)
- **Persona**: "tú" siempre, nunca "vos" ni "usted"
- **Tono**: directo, sin formalismos, con personalidad de coleccionista que sabe del tema
- **Evitar**: jerga regional ("pana", "wey", "tío", "che", "boludo"), traducciones literales del inglés
- **No usar emojis** en copy salvo casos muy puntuales (UI/branding del producto sí los usa, pero copy de marketing mejor sobrio)

### Logo

Está en `~/code/trocora-app/assets/icon.png` (1024×1024) y `adaptive-icon.png` (Android). Copialos al nuevo repo en `public/brand/`.

---

## 3. Features (copy listo para landing)

Esta lista la sacás de `~/code/trocora-app/app/paywall.tsx` (array `FEATURES`). Para la landing armala con énfasis en valor, no en mecánica:

### Features Free (gratis para todos)

- **Colección sin esfuerzo**: agregá cartas escaneando, buscando o por foto. Editás condición, precio estimado, foil/holo, lengua, cantidad.
- **Folders por juego**: organizá por mazo, set, condición o como quieras. Hasta 3 folders en plan Free.
- **Intercambios y ventas**: publicá cartas, recibí propuestas y coordiná encuentros seguros con check-in mutuo.
- **Chat in-app realtime**: hablás con el otro coleccionista dentro del trade, sin pasar a WhatsApp ni nada externo.
- **Zonas seguras sugeridas**: mapa con lugares verificados para hacer el intercambio (cafés, centros comerciales con seguridad).
- **Reputación post-encuentro**: rating mutuo después de cada trade. Construyes historial visible para futuros tradeos.
- **Precios de referencia**: pricing histórico de cada carta tomado de fuentes oficiales (TCGPlayer, etc.) para que sepas qué pedir.

### Features Pro (paywall — copy del paywall mobile)

- **Alertas de cartas**: te avisamos por push cuando alguien publica una carta de tu watchlist en tu región.
- **Boost en Explorar**: tus publicaciones aparecen primero en los resultados, llegan a más compradores.
- **Filtros avanzados**: buscá por condición, foil, set y mucho más.
- **Fotos propias**: subí fotos reales de tus cartas en cada publicación (hasta 5 por carta).
- **Stats de colección**: valor histórico, completitud de sets y top cartas.
- **Badge Trocora Pro**: mostrale a la comunidad que sos coleccionista serio.
- **Sin límites**: carpetas, regiones, publicaciones y trades ilimitados.
- **Exportar colección**: bajá tu colección a CSV o PDF cuando quieras (próximamente).

---

## 4. Pricing

### Trocora Free (default)

| Recurso | Límite |
|---|---|
| Folders | 3 |
| Regiones simultáneas | 1 |
| Cartas publicadas | 30 |
| Intercambios activos | 5 |
| Stats / Watchlist / Boost / Fotos propias | ❌ |

Política de "grandfather": si un Pro hace downgrade, el contenido existente se queda, pero no puede agregar más hasta volver bajo límites.

### Trocora Pro

| Plan | Precio | Trial |
|---|---|---|
| Mensual | **$4.99 USD** / mes | — |
| Anual | **$39.99 USD** / año (equivale a $3.33/mes, ahorrás ~33%) | **7 días gratis** |

Pricing localizado en 175 países por App Store auto-conversion. Misma estructura en Google Play.

Product IDs (mismo identifier iOS + Android):
- `trocora_pro_monthly`
- `trocora_pro_annual`

Entitlement único: `pro` (en RevenueCat).

---

## 5. Pages del sitio (alcance "Completo marketing")

### `/` — Landing

1. **Hero**: tagline + CTA "Descargar en App Store" + "Próximamente en Play Store" (o ambos cuando Android salga). Phone mockup con screenshots de la app rotando.
2. **Trust strip**: "Trade seguro" + "Comunidad verificada" + "+X juegos soportados" (íconos)
3. **Features section**: grid 2 cols con las features Free (mostrando que la base ya es potente)
4. **Pro section**: card oscuro con badge Pro, hero del precio anual, lista de features Pro, CTA "Ver planes"
5. **Cómo funciona**: 3 steps (1. Agregá tu colección · 2. Publicá para trade · 3. Coordiná encuentros seguros)
6. **Testimonials slider**: 3-5 testimonios de coleccionistas (pueden ser inicialmente curados/de beta testers)
7. **FAQs accordion**: 8-12 preguntas (ver lista abajo)
8. **CTA final**: descargar + footer

### `/privacy` — Privacy Policy (CRÍTICO para Apple review)

Contenido obligatorio (mínimo GDPR + Apple guidelines):

- Quién recolecta los datos (Trocora / razón social)
- Qué datos recolectamos: email, foto perfil, ubicación aproximada (solo si concedes permiso), cartas/colección, mensajes de chat, push tokens
- Por qué los recolectamos
- Con quién los compartimos (Supabase como procesador, RevenueCat para suscripciones, ExponentPushNotifications)
- Derechos del usuario: acceso, rectificación, **borrado** (ya implementado en la app), portabilidad
- Cómo contactar para ejercer derechos: email support
- Política de retención
- Política de menores (no se permite uso a menores de 13 sin consentimiento parental)
- Fecha de última actualización

### `/support` — Support / FAQ (CRÍTICO para Apple review)

- Email de contacto principal
- FAQs comunes (qué hago si...)
- Link a /privacy y /terms
- Form de contacto opcional

### `/terms` — Terms of Service

- Descripción del servicio
- Cuenta de usuario (registro, suspensión)
- Suscripciones de pago: precios, renovación auto, cancelación, reembolsos (delegados a App Store / Play)
- Limitación de responsabilidad sobre los intercambios físicos entre usuarios
- Propiedad intelectual
- Indemnización
- Jurisdicción aplicable

### `/blog` — Blog (v2, vacío inicial)

Setup ready pero sin posts iniciales. Categorías sugeridas: "Guías de coleccionismo", "Updates del producto", "Comunidad".

---

## 6. FAQs sugeridas (para landing y /support)

1. **¿Cuánto cuesta Trocora?** Es gratis. Tenés un plan Pro opcional ($4.99/mes o $39.99/año con 7 días gratis) que te desbloquea funciones avanzadas como alertas, stats y publicaciones ilimitadas.
2. **¿Cómo es un trade seguro?** Coordinás un encuentro en una zona segura sugerida, ambos hacen check-in en la app cuando se ven, y las cartas se transfieren automáticamente en la app cuando los dos confirman.
3. **¿Qué juegos soportan?** Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Digimon y Lorcana.
4. **¿Tengo que pagar para usar la app?** No. Las funciones core (colección, trades, chat, encuentros) son gratis para siempre.
5. **¿Cómo cancelo mi suscripción Pro?** Desde la configuración de tu tienda (App Store o Google Play). El acceso Pro continúa hasta el final del período pagado.
6. **¿Mis datos están seguros?** Sí. Usamos Supabase (Postgres con encriptación en reposo, RLS por usuario) y nunca compartimos tus datos con terceros para publicidad.
7. **¿Puedo borrar mi cuenta?** Sí, desde Configuración → Privacidad → Eliminar cuenta. Se borran tus datos completos en 30 días.
8. **¿Por qué no hay versión web?** Trocora está pensada para usarse en la calle, durante encuentros. Las funciones críticas (check-in, ubicación, push) son nativas mobile.
9. **¿En qué países está disponible?** En la App Store global. Optimizada para Latinoamérica y España.
10. **¿Cómo reporto un problema o un usuario?** Email a support@trocora.com o desde la app (Perfil → Configuración → Soporte).

---

## 7. Requisitos legales y de tienda

### Para Apple App Store review

- **Privacy Policy URL** público y accesible (Apple lo exige obligatorio para apps con auth o IAP)
- **Support URL** público
- **Marketing URL** opcional pero recomendado
- **Subscription Terms** visible en el paywall de la app: precio, duración, renovación auto, link a Privacy y Terms. Esto ya está implementado en `app/paywall.tsx` con el `legalText` al final.
- **App Review Notes**: cuando submitís, podés incluir credenciales demo (un user/pass de testing) para que Apple pueda probar IAP. Importante coordinar cuando llegue ese paso.

### Para Google Play Console review

- Privacy Policy URL (mismo requisito que Apple)
- Data Safety section en Play Console: declarar qué datos colecta la app
- Política de cuenta deletable
- Si la app permite chat: política de moderación de contenido

### Recomendaciones de copy legal

Si no tenés abogado todavía, podés usar plantillas estándar:
- **iubenda** o **Termly** generan PP/Terms personalizables (~$50-100/año, vale la pena para evitar rechazos)
- Alternativa gratis: redactar PP basado en plantillas oficiales (Apple/Google las publican). Asegurarse de que mencione todos los SDKs externos.

---

## 8. SDKs externos a mencionar en Privacy Policy

| SDK | Datos que maneja |
|---|---|
| Supabase | Auth, datos de colección, mensajes de chat, push tokens, fotos de avatar/cartas |
| RevenueCat | ID de usuario para asociar suscripción, productos comprados, status premium |
| Expo Notifications | Push tokens (almacenados en Supabase) |
| Expo Location | Coordenadas aproximadas (solo con permiso del usuario) |
| App Store / Google Play | Procesamiento de pagos de suscripciones |
| Resend (email) | Envío de OTP de verificación |

---

## 9. Stack web sugerido y bootstrap

```bash
cd ~/code
npx create-next-app@latest trocora-web --typescript --tailwind --app --src-dir=false --import-alias="@/*" --eslint --turbopack
cd trocora-web
npm install framer-motion lucide-react clsx
```

### Dependencias adicionales recomendadas

```bash
# UI helpers
npm install @radix-ui/react-accordion @radix-ui/react-dialog
# SEO / metadata
npm install next-sitemap
# Type-safe styles
npm install -D @types/node
```

### Estructura propuesta

```
trocora-web/
  app/
    layout.tsx              ← root layout, fonts, metadata, theme
    page.tsx                ← landing (/)
    privacy/page.tsx        ← /privacy
    support/page.tsx        ← /support
    terms/page.tsx          ← /terms
    blog/page.tsx           ← /blog (index, vacío v1)
    blog/[slug]/page.tsx    ← /blog/[post] (estructura ready)
    opengraph-image.tsx     ← OG image generation
  components/
    hero/                   ← Hero con phone mockup animado
    features-grid/          ← Grid de features Free
    pro-section/            ← Card destacada del plan Pro
    how-it-works/           ← 3-step section
    testimonials/           ← Slider
    faqs/                   ← Accordion radix
    footer/                 ← Links + social + app store badges
    nav/                    ← Top nav sticky
    cta-banner/             ← Floating CTA
  lib/
    brand.ts                ← colores hex, font names, breakpoints
    content/
      features.ts           ← Array de features Free y Pro
      faqs.ts               ← Array de FAQs
      testimonials.ts       ← Testimonials hardcoded
      pricing.ts            ← Planes y precios
  public/
    brand/                  ← logo, icon, app store badges oficiales
    screenshots/            ← Screenshots de la app mobile (1290×2796 PNG)
    og/                     ← Imágenes para social sharing (1200×630)
  CONTEXT.md                ← (este archivo, traído del repo mobile)
```

### Deploy

Vercel free tier es perfecto. Conectás el repo de GitHub y se deploya en cada push a main. Custom domain (trocora.com) se setea desde el dashboard de Vercel.

---

## 10. SEO

### Metadata base (en `layout.tsx`)

```typescript
{
  title: {
    default: 'Trocora — Intercambio de cartas TCG seguro',
    template: '%s | Trocora',
  },
  description: 'La app para coleccionistas de Pokémon, Magic, Yu-Gi-Oh! y más. Intercambiá, vendé y descubrí cartas cerca tuyo con encuentros seguros.',
  keywords: ['intercambio cartas', 'tcg', 'pokémon', 'magic the gathering', 'yu-gi-oh', 'lorcana', 'coleccionistas'],
  openGraph: {
    title: 'Trocora',
    description: 'Intercambio de cartas TCG seguro',
    type: 'website',
    locale: 'es_MX',
    siteName: 'Trocora',
    images: [{ url: '/og/default.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trocora',
    description: 'Intercambio de cartas TCG seguro',
    images: ['/og/default.png'],
  },
}
```

### Sitemap + robots

Usar `next-sitemap` (ya en deps). Config en `next-sitemap.config.js`.

---

## 11. Assets a copiar del repo mobile

| Asset | Origen | Destino |
|---|---|---|
| Logo principal | `assets/icon.png` | `public/brand/icon-1024.png` |
| Adaptive icon | `assets/adaptive-icon.png` | `public/brand/icon-adaptive.png` |
| Splash | `assets/splash-icon.png` | `public/brand/splash.png` |
| App screenshots | (Tomar de TestFlight 1290×2796) | `public/screenshots/01.png`... `05.png` |
| App Store badges | Apple / Google las publican | `public/brand/appstore-badge.svg` y `playstore-badge.svg` |

App Store badge: https://developer.apple.com/app-store/marketing/guidelines/ — descargar versión "Available on the App Store" en negro o blanco.

Play Store badge: https://play.google.com/intl/en_us/badges/ — bajar SVG.

---

## 12. Reglas del agente (carryover del proyecto mobile)

Estas reglas vienen del CLAUDE.md de `trocora-app` y aplican igual al web:

- **No mencionar al asistente** en código, comentarios, PRs, commits. Sin "Co-Authored-By: Claude", sin "Generated with Claude". Commits firmados solo por el autor humano.
- **No hacer git push ni deploy sin instrucción explícita**. Push, `vercel deploy`, todo eso solo cuando el usuario lo pida.
- **Comentarios mínimos**. No documentar lo obvio.
- **Strings en español neutro mexicano** (referencia: usar "tú", no "vos", no "usted").
- **Preferir editar archivos a crear archivos nuevos**.

---

## 13. Cuando esté listo el sitio

- Privacy + Support + Terms públicos → desbloquea el submit a App Review (resuelve el blocker actual de IAP en TestFlight)
- Compartir URL en App Store Connect como Privacy Policy URL y Support URL
- Misma URL para Google Play Console cuando se lance Android

---

## 14. Roadmap del proyecto web

**v1 (4-6h)**: Landing + Privacy + Support + Terms — desbloquea Apple review

**v2 (1 día)**: Testimonials slider + FAQs accordion + Screenshots interactivos + OG images + SEO completo

**v3 (1 día)**: Blog setup (MDX o Notion como source) + Custom domain + Analytics (Plausible / Vercel Analytics)

**v4 (futuro)**: i18n inglés, integración con press kit, changelog público, status page

---

## 15. Contactos relevantes

- **Apple Developer Team ID**: 25297LSAMZ
- **App Apple ID**: 6768488420
- **App Bundle ID**: com.trocora.app
- **Supabase Project Ref**: ujcwxvzesjtmzcpyvqdo
- **EAS Project ID**: 960bb013-816a-4aa1-8559-16b7cdac6842

---

## Cómo arrancar la sesión nueva con Claude

Cuando abras Claude en el directorio `~/code/trocora-web/`, podés copiarle como primer mensaje:

> Leé `CONTEXT.md` que está en la raíz. Resume en 5 puntos lo que entendiste del producto, brand y stack, y proponé un plan para v1 (landing + privacy + support + terms). Confirmá antes de empezar a crear archivos.

Eso le da contexto completo sin tener que explicarle nada.
