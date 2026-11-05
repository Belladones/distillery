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

Définir `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum) de façon sécurisée dans le processus, puis `npm run admin:create`. Ce script crée le compte ou réinitialise son mot de passe et lui attribue le rôle admin. Retirer ensuite ces deux variables. Aucun identifiant par défaut. Se connecter via l’icône compte pour accéder à **Toutes les commandes** et **Produits & stocks**. Une image principale et jusqu’à huit images de galerie sont disponibles par produit. Les images sont des URL HTTPS (par exemple Cloudinary/S3) ou des fichiers statiques ajoutés à `public/` ; pas d’upload intégré.

Les commandes payées peuvent être marquées expédiées avec le lien HTTPS du transporteur. Le client retrouve ce lien dans son compte. Aucun contrat transporteur ni achat d’étiquette automatique.

## Render + Neon

1. Créer une base PostgreSQL Neon, copier sa chaîne de connexion, avec TLS (`sslmode=require`).
2. Pousser ce dépôt dans votre GitHub puis créer un Blueprint Render à partir de `render.yaml`. Le plan Starter permet le hook `preDeployCommand` de migration. Pour un autre plan, exécuter la migration séparément avant le premier démarrage.
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
