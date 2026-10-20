# Activation des comptes Google et Discord

Les fournisseurs Google et Discord ont été vérifiés **activés dans Supabase** le 19 octobre 2026. Le code de connexion est prêt pour publication ; la validation réelle de chaque connexion doit suivre le déploiement. Ne coller aucun secret dans un message, dans Git ou dans le HTML.

## Valeurs communes

- Projet Supabase : `gsfwvaeyrufppausqdnr` — À mon rythme.
- Callback à enregistrer chez **Google et Discord** : `https://gsfwvaeyrufppausqdnr.supabase.co/auth/v1/callback`.
- Adresse du site et retour autorisé : `https://nh1980mg.github.io/a-mon-rythme/` (déjà enregistrés dans Supabase).
- Origine Google autorisée : `https://nh1980mg.github.io`.

## Google

1. Le compte Google initial affichait **Service non disponible pour votre compte**. Le changement de compte a rétabli l’accès à Google Cloud le 19 octobre 2026.
2. Le projet dédié **A mon rythme** est créé : `ordinal-algebra-512104-v3` (numéro public `530454881766`). Ne pas réutiliser les secrets d’une autre application.
3. La configuration Google Auth Platform **À mon rythme** est créée avec l’adresse de support/contact approuvée par le titulaire et l’audience externe en mode test. Pour ouvrir l’accès à d’autres personnes, tenir compte des utilisateurs test autorisés et de l’état de publication.
4. Déclarer seulement les permissions d'identité : `openid`, adresse e-mail et profil. Aucun accès aux messages Gmail.
5. Un client OAuth **Application Web** dédié est configuré avec l’origine et le callback ci-dessus. Ses identifiants sont gérés dans Supabase, sans secret dans le dépôt. Aucun secret ne doit être envoyé dans le chat.
6. Dans [Supabase → Google](https://supabase.com/dashboard/project/gsfwvaeyrufppausqdnr/auth/providers), entrer le Client ID et le Client Secret dans le fournisseur Google puis l'activer. Ne pas désactiver la vérification du nonce pour contourner une erreur.

## Discord

1. Se connecter au [portail développeur Discord](https://discord.com/developers/applications). Il demandait une connexion lors de la préparation.
2. L’application **À mon rythme** est créée : identifiant public `1561142989798248508`. Aucun bot n’est nécessaire.
3. Le callback ci-dessus est enregistré et confirmé dans OAuth2. Garder les permissions d'identité et d'adresse e-mail uniquement ; aucun accès aux serveurs ou conversations.
4. Le titulaire crée et saisit le Client Secret dans le [fournisseur Discord de Supabase](https://supabase.com/dashboard/project/gsfwvaeyrufppausqdnr/auth/providers), avec le Client ID, puis active le fournisseur. Ne partager le secret ni ici ni dans le dépôt.

## Publication et validation

Publier le code préparé sur le site existant après revue, sans ajouter de secret. Tester ensuite chaque fournisseur : connexion, création d'un objectif, rechargement, déconnexion, puis retour avec le même compte. Vérifier qu'un second compte ne voit pas les données du premier.

Pour récupérer les données du fichier local dans la version web, exporter le JSON depuis le fichier et l'importer dans le mode sans compte du site ; ensuite, sur un compte neuf, choisir explicitement **Copier mes données locales**. Les fichiers locaux et le site ont des stockages navigateur distincts.

Une ouverture `file://` ne permet pas le retour OAuth : employer l'adresse officielle du site. Un test de simulation ou une configuration enregistrée ne remplace pas cet aller-retour réel.
