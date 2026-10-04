Tu es un Senior Product Designer + Senior Frontend Engineer spécialisé en UI/UX SaaS premium.

Ta mission est de concevoir et implémenter une expérience d'authentification haut de gamme pour une plateforme immobilière / property management.

IMPORTANT :
Je veux une interface inspirée des tendances visuelles des meilleures interfaces "property login / real estate login" disponibles sur Dribbble, mais PAS une copie pixel-perfect d'un design existant.

Référence inspiration :
https://dribbble.com/search/property-login-page

Utilise cette référence uniquement pour comprendre :

- composition visuelle
- hiérarchie
- proportions
- ambiance
- traitement immobilier premium
- rapport image / formulaire
- onboarding
- typographie
- espace négatif

La réalisation finale doit être originale.

==================================================

1. # STACK TECHNIQUE

Projet :

- React / Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- ReUI
- Framer Motion
- Lucide React
- React Hook Form
- Zod

Ne pas utiliser Bootstrap.

Utiliser les composants shadcn/ui comme primitives lorsque disponibles :

- Card
- Input
- Label
- Button
- Checkbox
- Separator
- Avatar
- Badge
- Tabs
- Tooltip
- Alert
- Form

Utiliser ReUI pour enrichir les composants avancés lorsque pertinent.

Framer Motion doit gérer toutes les animations importantes.

================================================== 2. OBJECTIF UX
==================================================

Créer DEUX pages :

/login

/register

Les deux pages doivent appartenir au même système de design.

L'utilisateur doit avoir immédiatement l'impression d'utiliser :

- une plateforme immobilière premium
- moderne
- sécurisée
- fiable
- élégante
- technologique
- haut de gamme

Le design doit être suffisamment professionnel pour une plateforme SaaS commercialisable.

================================================== 3. DIRECTION ARTISTIQUE
==================================================

Créer une interface :

Premium
Minimal
Dark
Futuristic
Architectural
Immersive
Elegant

Palette principale :

background:
#050505
#08090B
#0D0F12

surface:
rgba(255,255,255,0.04)

border:
rgba(255,255,255,0.08)

texte principal:
#FFFFFF

texte secondaire:
rgba(255,255,255,0.60)

accent lumineux :
utiliser une couleur chaude / dorée ou ambre très subtile.

Exemple :
#F5B85B

NE PAS transformer l'interface en dashboard cyberpunk.

La lumière doit rester élégante et architecturale.

================================================== 4. STRUCTURE DESKTOP
==================================================

Desktop :

min-height: 100vh

Créer une composition en deux zones.

GAUCHE :
zone visuelle immobilière.

DROITE :
zone authentification.

Ratio approximatif :

45% / 55%

ou

50% / 50%

La partie visuelle doit être légèrement dominante.

================================================== 5. HERO IMMOBILIER
==================================================

La partie gauche doit contenir une grande image immersive représentant :

- architecture contemporaine
- appartement haut de gamme
- villa moderne
- intérieur premium
- skyline
- immobilier de luxe

L'image doit occuper presque toute la hauteur.

Utiliser :

object-cover

Ajouter plusieurs couches :

1. image
2. gradient sombre
3. blur léger
4. overlay radial
5. éléments lumineux abstraits

L'image ne doit jamais rendre le texte illisible.

================================================== 6. HERO COPY
==================================================

Ajouter un petit badge :

"PROPERTY MANAGEMENT"

ou

"REAL ESTATE PLATFORM"

Puis un grand headline :

"Manage properties.
Experience better."

ou une version française :

"Gérez vos biens.
Réinventez votre expérience."

Le texte doit être très grand.

Desktop :
font-size approximatif :
clamp(3rem, 5vw, 6rem)

Font-weight :
600 / 700

Letter spacing :
-0.04em

Créer une animation d'apparition mot par mot.

================================================== 7. ANIMATION DU TEXTE
==================================================

Utiliser Framer Motion.

Au chargement :

badge :
opacity 0 → 1
y 15 → 0

headline :
opacity 0 → 1
y 40 → 0

Chaque ligne / mot apparaît avec un stagger.

Exemple conceptuel :

containerVariants
itemVariants

transition :
duration: 0.7
ease: [0.22, 1, 0.36, 1]

NE PAS utiliser d'animations brutales.

Tout doit avoir une sensation premium et fluide.

================================================== 8. FORM CARD
==================================================

Le formulaire doit être placé dans un container moderne.

Largeur :
400px à 480px

Créer un effet :

glassmorphism

background:
rgba(255,255,255,0.035)

backdrop-filter:
blur(24px)

border:
1px solid rgba(255,255,255,0.09)

box-shadow :
très subtil

border-radius :
24px à 28px

Padding :
32px à 40px

================================================== 9. EFFET "LIGHT TRAVELING BORDER"
==================================================

C'est un élément ESSENTIEL.

Le cadre du formulaire doit donner l'impression qu'une petite source lumineuse parcourt continuellement son contour.

Créer un effet de lumière qui :

- commence en haut
- parcourt le bord droit
- descend
- traverse le bas
- remonte par la gauche
- recommence

La lumière doit être :

fine
diffuse
soft
premium

Pas de gros néon.

Créer l'effet avec :

CSS conic-gradient
ou
motion.div
ou
pseudo-element animé
ou
SVG path animé

Priorité :
performance GPU.

L'effet doit ressembler à une petite particule lumineuse parcourant le cadre.

Exemple visuel :

───────────────●──────
↑
lumière

La lumière doit laisser une petite traînée/glow.

Ajouter :

filter: blur(...)
box-shadow

L'animation doit être infinie.

duration :
5 à 8 secondes.

================================================== 10. FORM GLOW
==================================================

Ajouter derrière le formulaire un halo très léger :

radial-gradient

Exemple conceptuel :

radial-gradient(
circle at center,
rgba(245,184,91,0.10),
transparent 65%
)

Le halo doit respirer très légèrement.

Utiliser Framer Motion :

scale:
1 → 1.04 → 1

opacity:
0.4 → 0.65 → 0.4

duration:
5s

repeat:
Infinity

ease:
easeInOut

================================================== 11. LOGIN PAGE
==================================================

Créer :

Logo

Bienvenue

"Welcome back"

Sous-titre :

"Sign in to continue managing your properties."

ou français :

"Connectez-vous pour accéder à votre espace."

Fields :

Email
Mot de passe

Ajouter :

Forgot password?

Checkbox :
"Remember me"

CTA :

"Sign in"

Puis separator :

"OR"

Boutons :

Continue with Google

Continue with Apple

ou autres providers pertinents.

Puis :

"Don't have an account?"

"Create account"

Le lien doit pointer vers :

/register

================================================== 12. REGISTER PAGE
==================================================

Créer une vraie page d'inscription.

Titre :

"Create your account"

Sous-titre :

"Join the future of property management."

Fields :

First name
Last name
Email
Password
Confirm password

Option :

Account type

avec :

Property owner
Property manager
Agent

Utiliser Select / RadioGroup shadcn.

CTA :

"Create account"

Puis :

"Already have an account?"

"Sign in"

Le lien doit pointer vers :

/login

================================================== 13. REGISTER UX
==================================================

Ne pas afficher un énorme formulaire compact.

Créer un onboarding élégant.

Possibilité :

STEP 1
Personal information

STEP 2
Account type

STEP 3
Security

Créer une progression très subtile.

Exemple :

01 ───────── 02 ───────── 03

Animation du progress indicator avec Framer Motion.

Mais uniquement si cela améliore réellement l'expérience.

La priorité reste la simplicité.

================================================== 14. FORM INPUT DESIGN
==================================================

Les inputs doivent être très premium.

Background :
rgba(255,255,255,0.035)

Border :
rgba(255,255,255,0.08)

Height :
48-54px

Border radius :
12-14px

Placeholder :
rgba(255,255,255,0.35)

Focus :

border-color légèrement accentuée

box-shadow :
0 0 0 3px rgba(accent,0.08)

Transition :
200-300ms

Ajouter des icônes Lucide :

Mail
Lock
Eye
EyeOff
User
Building2

================================================== 15. MICRO-INTERACTIONS
==================================================

Chaque interaction doit être animée.

Input focus :
scale très léger

Button hover :
translateY(-1px)

Button active :
scale(0.98)

Button glow :
très subtil

Icons :
animation légère lors du focus

Password visibility :
rotation/fade subtile

Validation :
check icon avec scale + opacity

Erreur :
shake très léger

NE PAS SUR-ANIMER.

================================================== 16. BUTTON
==================================================

CTA principal :

full width

height :
52-56px

border-radius :
14px

background :
accent ou gradient très subtil

Créer un effet lumineux au hover.

Ajouter éventuellement :

::before

avec un gradient animé.

Hover :

translateY(-1px)
brightness légèrement supérieur

Active :

scale(0.98)

Loading :

spinner animé

Le bouton doit afficher :

"Signing in..."

pendant l'appel API.

================================================== 17. PAGE TRANSITION
==================================================

Lors du passage :

/login → /register

ou

/register → /login

Créer une transition Framer Motion.

Ne pas faire un simple changement brutal.

Animation :

form sort :
opacity 1 → 0
x ±20

nouveau form :
opacity 0 → 1
x ∓20

duration :
0.35 - 0.5 sec

Utiliser AnimatePresence.

================================================== 18. BACKGROUND ATMOSPHERE
==================================================

Le background doit avoir de la profondeur.

Créer :

- gradients radiaux
- blur blobs
- grain extrêmement subtil
- lignes architecturales très discrètes
- light spots

Mais éviter :

❌ particules excessives
❌ étoiles
❌ cyberpunk
❌ animations distrayantes

Le design doit rester :

luxury real estate.

================================================== 19. RESPONSIVE
==================================================

Mobile :

La partie image peut disparaître ou devenir une petite zone supérieure.

Formulaire :

width:
100%

padding :
20-24px

Card :
border-radius:
20px

Hero :

hauteur :
220-300px

Desktop :
split-screen

Tablet :
split-screen réduit

Mobile :
stack vertical

Tous les éléments doivent rester accessibles.

================================================== 20. ACCESSIBILITÉ
==================================================

Respecter :

WCAG

Tous les inputs doivent avoir un label.

Les boutons doivent avoir des états :

hover
focus
active
disabled
loading

Focus visible.

Navigation clavier complète.

Respecter :

prefers-reduced-motion

Si l'utilisateur demande reduced motion :

désactiver ou réduire fortement :

- traveling light
- background animations
- page transitions
- stagger excessif

================================================== 21. PERFORMANCE
==================================================

IMPORTANT :

Les animations doivent être GPU-friendly.

Privilégier :

transform
opacity

Éviter de faire animer :

width
height
top
left

Éviter les animations coûteuses.

Ne pas créer 50 éléments animés.

Le traveling light doit être optimisé.

================================================== 22. ARCHITECTURE DES COMPOSANTS
==================================================

Créer une architecture propre :

components/
auth/
auth-layout.tsx
auth-hero.tsx
auth-card.tsx
auth-light-border.tsx
login-form.tsx
register-form.tsx
social-auth.tsx
password-input.tsx
auth-divider.tsx
auth-brand.tsx

app/
login/
page.tsx

register/
page.tsx

Créer des composants réutilisables.

Ne PAS dupliquer le code login/register.

================================================== 23. SHADCN
==================================================

Utiliser shadcn/ui comme base structurelle.

Installer / utiliser au besoin :

button
input
label
card
checkbox
separator
select
radio-group
form
alert
tooltip

Ne pas réinventer les composants simples déjà disponibles dans shadcn.

En revanche, le styling final doit être fortement personnalisé.

================================================== 24. REUI
==================================================

Utiliser ReUI lorsque cela apporte une vraie valeur pour :

- interactions
- navigation
- composants avancés
- états
- feedback
- surfaces
- primitives visuelles

Ne pas utiliser ReUI uniquement pour multiplier les dépendances.

Le système doit rester cohérent avec shadcn.

================================================== 25. FRAMER MOTION
==================================================

Créer des variants réutilisables :

containerVariants
itemVariants
pageVariants
cardVariants

Utiliser :

AnimatePresence
motion.div
motion.span
useReducedMotion

Créer une animation d'entrée globale :

1. background
2. hero
3. brand
4. title
5. subtitle
6. form
7. footer

Avec stagger.

================================================== 26. LOGO / BRAND
==================================================

Prévoir un emplacement pour le logo de l'application.

Exemple :

"EstateFlow"

ou

"PropertyOS"

Le logo doit être facilement remplaçable.

Créer :

BrandLogo component.

================================================== 27. COPYWRITING
==================================================

Ne pas utiliser de lorem ipsum.

Utiliser de vrais textes.

Login :

"Welcome back"

"Sign in to continue to your property workspace."

Register :

"Create your account"

"Build, manage and grow your property portfolio."

Bouton :

"Sign in"

"Create account"

Lien :

"Forgot password?"

"Create an account"

"Already have an account?"

================================================== 28. ÉTATS DU FORMULAIRE
==================================================

Implémenter :

idle
focus
loading
success
error
disabled

Validation Zod.

Login :

email valide
password requis

Register :

firstName requis
lastName requis
email valide
password minimum 8 caractères
confirmPassword === password

Afficher les erreurs sous les inputs.

Les erreurs doivent être élégantes.

================================================== 29. PASSWORD STRENGTH
==================================================

Sur register :

Afficher une petite barre de sécurité :

Weak
Fair
Good
Strong

Animation de progression.

Critères :

length
uppercase
lowercase
number
special character

Le feedback doit rester compact.

================================================== 30. SOCIAL AUTH
==================================================

Créer :

Continue with Google

Continue with Apple

Les boutons doivent utiliser les icônes appropriées.

Ils doivent être visuellement secondaires au CTA principal.

================================================== 31. SECURITY UX
==================================================

Ajouter discrètement :

"Your data is encrypted and secure."

ou :

"Secure authentication · Privacy protected"

Ne pas faire de claims techniques non vérifiés.

================================================== 32. VISUAL QUALITY
==================================================

Le résultat final doit donner l'impression d'un produit :

Awwwards
Linear
Vercel
Stripe
Arc
premium proptech

mais avec une identité immobilière.

La priorité :

1. composition
2. typographie
3. spacing
4. profondeur
5. lumière
6. micro-interactions

Pas l'inverse.

================================================== 33. CE QU'IL NE FAUT PAS FAIRE
==================================================

NE PAS :

- copier exactement un Dribbble shot
- utiliser des gradients criards
- utiliser du glassmorphism excessif
- mettre trop de blur
- mettre trop de glow
- utiliser 10 animations simultanées
- utiliser des cartes génériques
- utiliser Bootstrap
- utiliser des composants énormes
- créer des CSS inline partout
- mettre toute la logique dans page.tsx
- ignorer mobile
- ignorer accessibility
- ignorer reduced motion

================================================== 34. LIVRABLE
==================================================

Je veux du CODE RÉEL.

Pas un mockup.

Pas du pseudo-code.

Pas une description.

Implémente directement :

/login

/register

avec :

- TypeScript
- Tailwind
- shadcn/ui
- ReUI
- Framer Motion
- React Hook Form
- Zod
- Lucide

Créer tous les composants nécessaires.

Créer les animations.

Créer le traveling light border.

Créer le glassmorphism.

Créer le responsive.

Créer les validations.

Créer les états loading/error/success.

Créer les transitions login/register.

================================================== 35. QUALITÉ FINALE
==================================================

Avant de terminer, vérifier :

[ ] Desktop 1440px
[ ] Desktop 1920px
[ ] Laptop 1366px
[ ] Tablet
[ ] Mobile 390px
[ ] Mobile 430px

Vérifier :

[ ] aucun overflow horizontal
[ ] aucune animation cassée
[ ] aucun layout shift
[ ] focus clavier
[ ] reduced motion
[ ] contraste
[ ] validation
[ ] loading state
[ ] password toggle
[ ] navigation login/register
[ ] responsive
[ ] performance

Le résultat doit être suffisamment propre pour être intégré directement dans une application SaaS de production.
