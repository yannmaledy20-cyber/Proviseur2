# Proviseur — application + multijoueur

Un seul serveur Node (sans dépendance) sert le jeu **et** le multijoueur : ligue en ligne, défis, salle des proviseurs, joueurs en ligne, applaudissements. Les codes de lycée (hors ligne) fonctionnent toujours.

## Nouveautés de la version 28 : graphismes réalistes (campus et ville)
- **Matériaux photoréalistes** : sol en latérite rouge, cour en pavés de béton, terrazzo dans les salles, murs en enduit peint aux couleurs de la tenue, toits en tôle ondulée, asphalte, bois, vitres réfléchissantes.
- **Lumière naturelle** : ciel HDR de midi qui éclaire toute la scène, soleil aligné sur le ciel, ombres douces, plafonds blancs dans les salles.
- **Personnages réalistes animés** : les élèves et adultes proches du joueur marchent, courent, s'assoient et s'agenouillent (sanction) ; teint, chemise et pantalon suivent la tenue de l'établissement.
- **Mobilier détaillé** : tables et chaises d'écolier, ventilateurs de plafond qui tournent, bancs en bois peint ; manguiers feuillus, palmiers et collines boisées à l'horizon.
- **Ville en 3D réaliste** : ciel HDR, asphalte, trottoirs pavés, sol en latérite, façades enduites aux fenêtres vitrées réfléchissantes, voitures et taxis carrossés (peinture métallisée, jantes chromées, phares), passants réalistes animés, clients assis au maquis, arbres d’alignement et palmiers.
- **Bouton « Graphismes : réalistes / classiques »** dans la visite et dans la ville. Le mode réaliste est activé par défaut sauf en qualité légère. Les détails s'affichent près du joueur et la résolution s'adapte automatiquement à l'appareil.
- Les ressources 3D (≈ 11 Mo) sont dans `public/assets/` : elles se téléchargent seulement à l'ouverture de la visite réaliste, puis restent en cache. Licences dans `public/assets/LICENCES.txt`.

## Nouveautés de la version 27
- **Vie du proviseur** : salaire mensuel sur un compte personnel, révisé à chaque bilan (−15 % à +15 %) selon les résultats et la satisfaction des supérieurs, prime de rendement, train de vie, bonheur (qui donne ou retire un point d’action), prêts bancaires. Onglet « Ma vie ».
- **Ville en 3D** : concessionnaire, agence immobilière, supermarché, banque, maquis, stade, agence de voyages, mairie, votre logement ; taxis, motos et passants ; conduite de votre propre voiture (touche F).
- **Événements** : plus de 30 nouveaux ; un événement ne revient pas avant 5 ans ; l’agitation varie d’une année à l’autre.
- **Difficulté** : enseignants débordés, classes pléthoriques, sujets plus ou moins durs selon les sessions, jour J de chaque candidat ; les 100 % deviennent hors de portée.
- **Plan libre du campus** : bâtiments en barre, en L ou en U, jusqu’à 4 niveaux, visitables en 3D par l’escalier.
- **Discipline en 3D** : élèves marqués d’un « ! » (bagarre, téléphone, retard, tenue, sommeil, graffitis, jeux d’argent, cigarette) et sept sanctions possibles, avec leurs conséquences.

Mise à jour sur Render : remplacez le contenu du dépôt par ce dossier puis redéployez. Les sauvegardes des joueurs sont conservées (elles restent dans leur navigateur). Le cache hors ligne passe en version 5 : les joueurs reçoivent la nouvelle version au prochain chargement.

## Lancer en local
    node server.js        # puis ouvrir http://localhost:3000
Ouvrez deux navigateurs (ou une fenêtre privée) pour jouer à deux.

## Mettre en ligne (obligatoire pour jouer à distance)
Le serveur doit être hébergé en HTTPS pour que vos amis s'y connectent et pour que l'installation de l'app soit proposée.
- **Render / Railway / Fly.io** : déposez ce dossier sur GitHub, créez un « Web Service » Node, commande de démarrage `node server.js`. Ajoutez un **disque persistant** monté sur `/data` et la variable `DATA_DIR=/data`, sinon la ligue est effacée à chaque redéploiement.
- **Docker** : `docker build -t proviseur . && docker run -p 3000:3000 -v proviseur-data:/data proviseur`
- **VPS** : `node server.js` derrière Caddy ou nginx (désactivez la mise en tampon pour `/api/stream`).

## Installer comme application
Ouvrez l'adresse HTTPS du jeu : Chrome/Edge proposent « Installer », Safari iOS : Partager → « Sur l'écran d'accueil ». Le jeu solo marche hors ligne.
Pour les stores (Play Store / App Store), emballez `public/` avec **Capacitor** et mettez l'URL du serveur dans `public/config.js` (`window.PROVISEUR_SERVER`).

## Sécurité intégrée
Identité anonyme par jeton secret (un joueur ne peut écrire que sur sa propre fiche), validation côté serveur, limites de débit (messages, défis, applaudissements), défis visibles seulement des deux joueurs concernés.
Variable optionnelle : `CORS_ORIGIN` pour restreindre les origines autorisées.

## Phase de test privée
Définissez `ACCESS_CODES="code-anna,code-paul,code-marc"` (un code par testeur). Sans code valide, personne n ouvre le jeu ni l API. Pour couper un testeur, retirez son code et redémarrez. Sans cette variable, l accès est libre : à utiliser au lancement officiel.
