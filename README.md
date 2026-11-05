# Les Libres — boutique de spiritueux

Boutique française responsive : catalogue filtrable, fiches et cocktails, panier, comptes clients, commandes, administration des produits/stocks et liens de suivi. Node.js 22+, Express, PostgreSQL, sessions serveur, Stripe Checkout et PayPal Orders v2.

## Démarrer

```sh
npm ci
npm run dev
```

Sans `DATABASE_URL`, le site fonctionne en **mode découverte** : catalogue et panier local, sans compte ni commande simulée. Ouvrir le port 3000 dans votre environnement de développement.

Pour activer la boutique, copier `.env.example` vers `.env`, définir `DATABASE_URL` et un `SESSION_SECRET` aléatoire (32 caractères minimum), puis :

```sh
npm run db:migrate
npm start
```

La migration est réexécutable : elle crée les tables et insère trois produits de démonstration uniquement s’ils n’existent pas. Elle ne modifie pas les fiches déjà créées. Ne publiez pas ce catalogue fictif comme des produits réels.

## Administrateur

Définir `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum) de façon sécurisée dans le processus, puis `npm run admin:create`. Ce script crée le compte ou réinitialise son mot de passe et lui attribue le rôle admin. Retirer ensuite ces deux variables. Aucun identifiant par défaut. Se connecter via l’icône compte pour accéder à **Toutes les commandes** et **Produits & stocks**. Une image principale et jusqu’à huit images de galerie sont disponibles par produit. Chaque champ image propose un import direct depuis l’ordinateur ou le téléphone. Les URL HTTPS et les fichiers statiques restent utilisables. Les onglets **Page d’accueil** et **Médiathèque** permettent de personnaliser le site et de gérer les images.

Les commandes payées peuvent être marquées expédiées avec le lien HTTPS du transporteur. Le client retrouve ce lien dans son compte. Aucun contrat transporteur ni achat d’étiquette automatique.

## Render + Neon

1. Créer une base PostgreSQL Neon, copier sa chaîne de connexion, avec TLS (`sslmode=verify-full`).
2. Pousser ce dépôt dans votre GitHub puis créer un Blueprint Render à partir de `render.yaml`. Le plan Starter permet le hook `preDeployCommand` de migration. Sans hook de pré-déploiement ni accès Shell, utiliser `npm run db:migrate && npm start` comme Start Command.
3. Renseigner `DATABASE_URL` avec la connexion Neon, `BASE_URL` avec l’URL HTTPS Render sans slash final, et les clés de paiement. Render génère `SESSION_SECRET`. Ne jamais versionner les secrets.
4. Déployer ; le build utilise `npm ci --omit=dev`, la migration prépare PostgreSQL et `npm start` lance le serveur sur `PORT`. `/api/health` vérifie la connexion SQL.
5. Créer l’administrateur depuis un shell sécurisé avec `npm run admin:create`.

Le proxy HTTPS doit être correctement déclaré (Render : un proxy, `trust proxy=1`). Cookies HttpOnly, SameSite=Lax, Secure en production. Les polices sont servies localement (licences dans public/fonts). Les photos de présentation sont des illustrations et doivent être remplacées par celles de votre distillerie.

## Paiements

### Stripe / carte bancaire

Définir `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`. Ajouter le webhook **HTTPS** `/api/webhooks/stripe` dans Stripe, événements `checkout.session.completed`, `checkout.session.async_payment_succeeded` et `checkout.session.expired`. Tester avec les clés de test et la carte de test 4242 4242 4242 4242. La signature, le montant, la devise et l’identifiant de session sont vérifiés. Le retour navigateur ne valide jamais une commande. Définir les clés live et le webhook live uniquement après validation métier.

### PayPal

Définir `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`. Tester avec deux comptes Sandbox (marchand et acheteur). La capture serveur est effectuée au retour de l’acheteur ; le compte client permet également de vérifier/capturer le paiement. Le montant, la devise et l’état de capture sont vérifiés avant confirmation. Pour passer en réel, utiliser les identifiants live et `PAYPAL_ENV=live`.

Configurer également le webhook PayPal **HTTPS** `/api/webhooks/paypal` pour `PAYMENT.CAPTURE.COMPLETED` et renseigner `PAYPAL_WEBHOOK_ID`. La signature est vérifiée par l’API PayPal, puis le montant et la devise sont comparés à la commande. Si le navigateur ne revient pas après l’approbation, le client peut utiliser « Vérifier mon paiement PayPal » pour finaliser la capture. La capture utilise une clé d’idempotence ; une nouvelle vérification récupère un paiement déjà capturé après une interruption. Ne pas expédier sans preuve de règlement.

### Stocks et commandes

Les prix et totaux sont calculés côté serveur. Le stock est réservé atomiquement en transaction (verrouillage SQL) au début du paiement. Les sessions Stripe durent 30 minutes ; les clients peuvent annuler une session Stripe encore ouverte depuis leur compte, ce qui libère le stock. Une commande payée n’est jamais annulée par cette route. Le webhook Stripe `checkout.session.expired` libère automatiquement les réservations des sessions expirées ; le client peut également annuler une session expirée depuis son compte. Un paiement PayPal ouvert doit être rapproché des données du prestataire par l’opérateur avant remise en stock. Aucun remboursement automatique ni libération à l’aveugle d’une réservation PayPal. Pas de remboursement automatisé, notification email ni facture PDF dans cette version.

La livraison est fixée à `SHIPPING_CENTS` (690 = 6,90 €), uniquement France. Configurez les taxes, l’éligibilité réelle des destinations (Corse/DOM-TOM), les transporteurs et tarifs selon votre activité avant exploitation.

## Vérifier

```sh
npm test
```

Le test d’intégration PostgreSQL est activé avec `TEST_DATABASE_URL` pointant vers une **base de test dédiée vide**. Il effectue des migrations, crée des données isolées et les supprime. Les tests de paiement réels nécessitent des comptes Sandbox et les secrets du prestataire.

## Avant ouverture commerciale

Cette version est un socle de développement, pas une validation juridique ou une boutique déjà exploitée. Remplacer la marque, les images génériques, le catalogue et les coordonnées de démonstration. Compléter et faire valider les mentions légales, CGV, rétractation, garanties, médiation, politique de confidentialité, informations produits (allergènes, origine, etc.), licences de vente d’alcool, obligations fiscales et contrôle de majorité approprié à votre activité. L’écran de majorité et la case à cocher ne constituent pas une vérification d’identité. Ajouter une procédure opérationnelle de remboursement/réconciliation et tester toute la chaîne de commande en Sandbox avant passage en production.

## Présentation de l’accueil et des produits

Le design des composants TSX fournis a été adapté dans `public/storefront.js` et `public/storefront.css`, sans remplacer les comptes, le panier, les paiements ou l’administration. Les routes `/products` et `/products/:slug` sont accessibles directement et au rechargement. Les contenus commerciaux restent ceux du catalogue PostgreSQL. Les styles sont limités au conteneur `.storefront`. Work Sans et Playfair Display sont hébergées localement.

Les visuels initiaux non joints utilisent une illustration de remplacement. Les administrateurs peuvent désormais importer leurs photos et un logo raster depuis **Page d’accueil**, sans modifier le dépôt. Les fichiers statiques décrits dans `public/assets/README.md` restent un autre moyen de fournir les visuels initiaux. Les témoignages reprennent les contenus fournis ; les faire confirmer avant publication commerciale. Aucun formulaire de newsletter fictif n’a été ajouté : le pied de page propose le contact email fourni.

## Upload des images et personnalisation de l’accueil

Après déploiement de cette version, exécuter la migration réexécutable `npm run db:migrate`. Sur Render sans Shell, conserver la **Start Command** `npm run db:migrate && npm start` : elle crée les tables `media` et `site_content` sans supprimer le catalogue ni écraser le contenu déjà publié. Aucun disque persistant Render n’est requis. Les nouveaux uploads utilisent Cloudinary ; voir la configuration ci-dessous.

- **Produits & stocks → Modifier / Ajouter** : importer l’image principale et jusqu’à huit photos de galerie. L’import remplit les champs et affiche un aperçu ; cliquer ensuite sur **Enregistrer le produit**.
- **Page d’accueil** : modifier le logo (facultatif), la bannière, les titres, le texte À propos, les six photos et descriptions du savoir-faire, les trois témoignages, la signature de marque, la collection, le bandeau, le pied de page et les métadonnées SEO. Les principales sections peuvent être masquées. **Prévisualiser** ouvre un aperçu sans publication. **Enregistrer et publier** rend les changements visibles dès le prochain chargement public, y compris dans le HTML de l’accueil. Une version concurrente n’est jamais écrasée silencieusement.
- **Médiathèque** : importer des photos, copier leurs liens pour les réutiliser et supprimer les images inutilisées. Une image encore référencée dans un produit ou un contenu publié ne peut pas être supprimée. Les imports non enregistrés dans un formulaire restent dans la médiathèque.

Formats acceptés : JPG, PNG, WebP, AVIF fixes ; 8 Mo et 36 mégapixels maximum par fichier. Le serveur vérifie le contenu, corrige l’orientation, réduit les dimensions à 2400 × 2400 maximum, supprime les métadonnées et convertit en WebP. SVG et fichiers animés ne sont pas acceptés à l’import. Les fichiers identiques après optimisation sont dédupliqués. Les routes d’upload sont réservées aux administrateurs et protégées par session et CSRF.

Les nouveaux fichiers optimisés sont envoyés à **Cloudinary** par le serveur avec des uploads signés. PostgreSQL conserve uniquement leurs métadonnées et leurs références Cloudinary (`data` reste NULL). Les liens `/media/:id` sont stables et redirigent vers l’URL HTTPS du CDN Cloudinary. Les images sont **publiques** dès l’import ; ne pas y mettre de documents privés.

Les anciennes images PostgreSQL restent lisibles, même sans clés Cloudinary. Si un nouvel import est reconnu comme un doublon d’une image PostgreSQL, celle-ci est transférée sur Cloudinary en conservant son lien `/media/:id`, puis son binaire PostgreSQL est effacé après confirmation de l’upload. Aucun transfert massif ni suppression des anciennes images n’est effectué au déploiement. La suppression d’une image Cloudinary depuis la médiathèque supprime aussi le fichier distant ; si Cloudinary refuse la suppression, l’entrée reste disponible pour réessayer. Les références enregistrées via le lien local ou directement via l’URL CDN sont protégées.

### Connecter Cloudinary sur Render

1. Créer un compte sur https://cloudinary.com (offre gratuite disponible, sous réserve de ses quotas). Dans la console Cloudinary, relever le **Cloud name** et ouvrir **Settings → API Keys** pour la clé et le secret API.
2. Dans **Render → service → Environment**, ajouter :

   | Variable                | Valeur                   |
   | ----------------------- | ------------------------ |
   | `MEDIA_STORAGE`         | `cloudinary`             |
   | `CLOUDINARY_CLOUD_NAME` | Le Cloud name, sans URL  |
   | `CLOUDINARY_API_KEY`    | La clé API Cloudinary    |
   | `CLOUDINARY_API_SECRET` | Le secret API Cloudinary |

3. Conserver **Start Command** : `npm run db:migrate && npm start` (ou utiliser le hook de migration du Blueprint). Enregistrer puis redéployer.
4. Dans l’administration, ouvrir **Médiathèque**. La configuration doit être indiquée, puis importer une photo de test et vérifier qu’elle apparaît aussi dans la Media Library Cloudinary et sur le site. Vérifier sa suppression après l’avoir retirée des produits et des contenus publiés.

Aucun preset unsigned, widget navigateur ou clé dans le frontend n’est nécessaire. Ne jamais publier le secret API ni le communiquer dans le chat. Les valeurs doivent être saisies dans les variables sécurisées Render. En l’absence de clés, les nouveaux uploads sont désactivés avec un message de configuration ; aucun retour silencieux au stockage Neon n’est effectué. Les clés erronées, les quotas dépassés ou une panne Cloudinary produisent une erreur d’import. Les photos déjà référencées restent accessibles via leur URL publique.

`MEDIA_STORAGE=postgres` reste disponible uniquement comme choix explicite pour le développement, les tests ou un retour au précédent stockage ; cela ne rapatrie pas les images Cloudinary existantes.

Les tests couvrent le SDK Cloudinary avec transport simulé (signature configurée côté serveur, URL CDN, absence de binaire en base, conservation des liens, permissions et erreurs). Un vrai upload sur votre compte reste à tester après saisie des clés.

## Cartes produits sur l’accueil

Dans **Produits & stocks → Modifier**, utiliser **Image principale** pour la photo du produit, avec le fond déjà présent dans le fichier. Elle est cadrée au format portrait 5:6, centrée, sans aplat de couleur, marge intérieure ni mélange de couleurs ajouté par le site. Le champ **Texture derrière la photo sur l’accueil** permet d’importer une autre image (via Cloudinary) ou de coller son URL. Cette texture est facultative ; vider le champ puis enregistrer la retire de la carte sans supprimer le fichier de la médiathèque. Le nom et la flèche sont alignés sur la photo. Toute la carte est cliquable.

La flèche glisse et devient orange au survol ou au focus clavier. Le mode « mouvements réduits » désactive les déplacements. Le catalogue et les fiches produits gardent leur présentation ; le choix de couleur reste réservé au fond de la fiche produit.

La migration ajoute `products.texture_image` avec une valeur vide pour les produits existants, sans modifier leurs autres informations. Conserver `npm run db:migrate && npm start` comme commande de démarrage Render. Les images utilisées comme textures sont protégées contre la suppression dans la médiathèque.
