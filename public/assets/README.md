# Visuels du frontend fourni

Les composants TSX reçus importent ces fichiers, qui n’étaient pas joints :

- `hero-banner.png`
- `bento1.png` à `bento6.png`
- `temoignage1.png` à `temoignage3.png`
- `Logo.svg`

Placer les photographies originales ici, sous ces noms, puis redéployer. Sans ces fichiers, le serveur sert l’illustration locale `public/distillery.png` en remplacement. Le logo est actuellement composé en texte ; `Logo.svg` pourra être intégré à réception.

Les images des bouteilles et leurs galeries restent celles configurées dans l’administration. Les fiches utilisent les descriptions, compositions et recettes réelles du catalogue : elles ne reprennent pas les textes de fabrication propres à un whisky pour tous les autres spiritueux.

Vous pouvez maintenant remplacer ces visuels depuis **Administration → Page d’accueil**, avec les boutons **Importer une image**. Il n’est plus nécessaire d’ajouter les photos au dépôt. Le logo peut être importé en PNG, JPG, WebP ou AVIF depuis la même page. Les nouveaux fichiers sont hébergés sur Cloudinary une fois les variables Render configurées. Les références sont conservées dans PostgreSQL et les anciennes images Neon restent accessibles.
