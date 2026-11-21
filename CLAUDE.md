# mtg-vtt

Table virtuelle de Magic: The Gathering.

- Dépôt public : n'y écrire aucune information sur l'infrastructure qui
  l'héberge ni sur des projets privés.
- La table ne vise pas le téléphone : cibler l'ordinateur (au moins 1280 px).
- Redémarrer le serveur après un build web. Le serveur limite à 300 requêtes
  par minute (`@fastify/rate-limit`) : une série de créations de tables peut
  répondre 429.
