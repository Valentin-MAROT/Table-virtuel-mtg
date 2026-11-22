import { useEffect, useState } from 'react';
import { useGame } from '../store/game.js';
import { sortedHand } from '../lib/handSort.js';
import { cardMeta } from '../lib/cards.js';
import { isLandTypeLine, landSlots, loadLandLayout } from '../lib/landLayout.js';
import { askConfirm, askNumber, askText, openDialog } from './Dialog.js';
import { mulliganWithConfirm } from '../lib/mulligan.js';
import { useT } from '../lib/i18n/index.js';

/** Barre d'actions haut-droite, calquée sur la table de référence. */
/** Jetons les plus fréquents, créables sans passer par la recherche. */
const QUICK_TOKENS = ['Treasure', 'Food', 'Clue', 'Blood', 'Soldier', 'Zombie'];

/*
 * **Les boutons Impeccable, enfin rendus — et deux corrections pour qu'ils le soient.**
 *
 * Ces trois constantes portaient chacune *deux* littéraux : l'ancienne valeur
 * affectée, puis la nouvelle posée en dessous — une **expression morte**, que
 * JavaScript évalue et jette. Les commentaires avaient glissé avec, décrivant
 * chacun la constante suivante. Le produit a donc affiché les anciens boutons
 * pendant tout ce temps en annonçant les nouveaux juste au-dessus, et rien ne
 * pouvait le dire : `no-unused-expressions` est une règle ESLint, et le dépôt
 * n'avait pas de configuration ESLint bien qu'il porte un script `lint`. Il en a
 * une désormais, et elle attrape exactement cette forme-là.
 *
 * Deux choses ont dû être corrigées pour que les valeurs voulues tiennent :
 *
 * - **`border-slate-750` n'existait pas.** Ni dans Tailwind, dont l'échelle
 *   `slate` saute de 700 à 800, ni dans le thème du projet. La classe ne
 *   produisait donc aucune règle, et la bordure serait retombée sur le défaut de
 *   `preflight` — du gris clair, sur un panneau sombre. Plutôt que de rabattre
 *   la valeur sur `slate-700` et de changer le dessin voulu, le jeton manquant
 *   est **défini** dans `tailwind.config.js` : `#293548`, milieu exact de
 *   `slate-700` (`#334155`) et `slate-800` (`#1e293b`).
 * - **`animate-pulse` est passé sous `motion-safe:`.** Un bouton qui pulse en
 *   permanence est précisément ce que les réglages « réduire les animations »
 *   existent pour éteindre. La variante garde l'effet pour tout le monde, sauf
 *   pour qui a demandé le contraire à son système.
 */

/** Bouton d'action courant : sombre, discret, lisible sur la table. */
const PRIMARY =
  'rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-100 shadow-sm backdrop-blur hover:bg-slate-700 hover:border-slate-600 transition-all active:scale-95';
/** Le cran en dessous : ce qui ouvre un menu plutôt que ce qui agit. */
const SECONDARY =
  'rounded-lg border border-slate-750 bg-slate-900/80 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-200 shadow-sm backdrop-blur hover:bg-slate-800 hover:border-slate-600 transition-all active:scale-95';
/** Le même bouton, mais c'est à nous de jouer : il doit se voir. */
const PRIMARY_ACTIVE =
  'rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-950/70 hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95 motion-safe:animate-pulse';

export function Toolbar({
  onCreateToken,
  onQuickToken,
  onOpenHelp,
  onOpenSettings,
}: {
  onCreateToken: () => void;
  onQuickToken: (name: string) => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
}): React.ReactElement {
  const t = useT();
  const send = useGame((s) => s.send);
  const mySeat = useGame((s) => s.mySeat);
  /** Les sièges, pour choisir à qui l'on révèle sa main. */
  const seats = useGame((s) => s.seats);
  /** À nous de jouer ? Le bouton « Passer le tour » s'allume alors. */
  const myTurn = useGame((s) => s.turn.activeSeat !== null && s.turn.activeSeat === s.mySeat);
  const [menu, setMenu] = useState<'none' | 'create' | 'actions'>('none');

  const close = (): void => setMenu('none');

  return (
    <div className="pointer-events-auto flex items-start gap-2">
      <button className={PRIMARY} onClick={() => send({ type: 'UNTAP_ALL' })}>
        Tout dégager
      </button>
      <button className={PRIMARY} onClick={() => send({ type: 'DRAW', count: 1 })}>
        Piocher
      </button>
      {/*
        Passer le tour était enterré dans le menu « Actions » et dans le menu du
        fond. C'est pourtant le geste le plus répété d'une partie : il mérite
        d'être sous la main, à côté de « Piocher ». Il se met en avant quand
        c'est à nous — c'est à ce moment-là qu'on le cherche.
      */}
      <button
        className={myTurn ? PRIMARY_ACTIVE : PRIMARY}
        data-test="end-turn"
        onClick={() => send({ type: 'END_TURN' })}
        title={myTurn ? 'Passer la main au joueur suivant' : "Ce n'est pas votre tour"}
      >
        Passer le tour
      </button>

      {/*
        **Annuler n'existait qu'au clavier.** `Ctrl+Z` marchait depuis toujours,
        mais rien ne le disait : un geste qu'aucune surface n'annonce n'existe
        que pour qui le connaît déjà.

        Le bouton n'est jamais grisé, et c'est délibéré : **le client ne sait
        pas** ce qui est annulable — la pile d'annulation vit au serveur, avec
        sa fenêtre de dix secondes et sa liste d'actions irréversibles. Le griser
        d'après une supposition locale reviendrait à inventer un état, ce que ce
        client ne fait nulle part. On envoie donc, et le serveur répond
        précisément : « Plus rien à annuler dans les dix dernières secondes »,
        « Mélanger la bibliothèque ne s’annule pas », ou « Quelqu’un a joué
        depuis ». Ces phrases arrivent dans le bandeau de refus, qui est fait
        pour être lu — c'est un meilleur retour qu'un bouton éteint et muet.
      */}
      <button
        className={SECONDARY}
        data-test="undo"
        onClick={() => send({ type: 'UNDO_LAST' })}
        title="Annuler la dernière action (Ctrl+Z)"
      >
        ↶ Annuler
      </button>

      <div className="relative">
        <button
          className={SECONDARY}
          onClick={() => setMenu((m) => (m === 'create' ? 'none' : 'create'))}
        >
          Créer ▾
        </button>
        {menu === 'create' && mySeat && (
          <Menu onClose={close}>
            <MenuItem onClick={() => { onCreateToken(); close(); }}>Jeton…</MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askText({
                  title: 'Poser une étiquette',
                  label: 'Texte de l’étiquette',
                  memory: 'toolbar-label',
                  submitLabel: 'Poser',
                }).then((text) => {
                  if (text) send({ type: 'ADD_LABEL', text, x: 40, y: 40 });
                });
              }}
            >
              Étiquette sur la table
            </MenuItem>
            <MenuItem
              onClick={() => {
                /*
                 * Un seul dialogue pour ce qui en demandait deux. Un compteur
                 * de joueur porte toujours un nombre — c'est le marqueur d'une
                 * carte qui peut n'être qu'un mot-clé —, la valeur est donc
                 * obligatoire ici, et zéro supprime le compteur.
                 */
                close();
                void openDialog({
                  title: 'Compteur de joueur',
                  submitLabel: 'Poser',
                  memory: 'player-counter',
                  fields: [
                    {
                      name: 'kind',
                      label: 'Type de compteur',
                      initial: 'poison',
                      maxLength: 40,
                      quick: ['poison', 'énergie', 'expérience', 'rad', 'ticket'].map((v) => ({
                        label: v,
                        value: v,
                      })),
                    },
                    {
                      name: 'value',
                      label: 'Valeur',
                      numeric: true,
                      initial: '1',
                      quick: [1, 2, 3, 5, 10].map((n) => ({ label: String(n), value: String(n) })),
                      hint: 'Zéro supprime le compteur.',
                    },
                  ],
                }).then((result) => {
                  if (!result) return;
                  const kind = result.values['kind'] ?? '';
                  const value = Number.parseInt(result.values['value'] ?? '', 10);
                  if (kind && Number.isFinite(value)) {
                    send({ type: 'SET_PLAYER_COUNTER', seat: mySeat, kind, value });
                  }
                });
              }}
            >
              Compteur de joueur…
            </MenuItem>
            {/* Jetons courants : un clic, sans passer par la recherche. */}
            <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-slate-500">Jetons rapides</p>
            {QUICK_TOKENS.map((name) => (
              <MenuItem key={name} onClick={() => { onQuickToken(name); close(); }}>
                {name}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>

      <div className="relative">
        <button
          className={SECONDARY}
          onClick={() => setMenu((m) => (m === 'actions' ? 'none' : 'actions'))}
        >
          Actions ▾
        </button>
        {menu === 'actions' && mySeat && (
          <Menu onClose={close}>
            <MenuItem
              onClick={() => {
                close();
                void askNumber({
                  title: 'Piocher combien de cartes ?',
                  label: 'Nombre de cartes',
                  initial: 1,
                  quick: [1, 2, 3, 5, 7],
                }).then((n) => {
                  if (n !== null) send({ type: 'DRAW', count: n });
                });
              }}
            >
              Piocher X…
            </MenuItem>
            <MenuItem onClick={() => { close(); void mulliganWithConfirm(send); }}>Mulligan</MenuItem>
            <MenuItem onClick={() => { close(); void mulliganWithConfirm(send, true); }}>Mulligan gratuit</MenuItem>
            {/*
              Monarque et initiative : un seul détenteur à la fois, le serveur
              les retire à l'ancien (`EXCLUSIVE_COUNTERS`). On les prend pour
              soi — c'est presque toujours celui qui les gagne qui clique.
            */}
            {(['monarch', 'initiative'] as const).map((kind) => {
              const held = (useGame.getState().seats.find((s) => s.id === mySeat)?.playerCounters ?? []).some(
                (c) => c.kind === kind,
              );
              const label =
                kind === 'monarch'
                  ? held ? 'Ne plus être le monarque' : '👑 Devenir le monarque'
                  : held ? 'Rendre l’initiative' : '🏰 Prendre l’initiative';
              return (
                <MenuItem
                  key={kind}
                  onClick={() => {
                    close();
                    send({ type: 'SET_PLAYER_COUNTER', seat: mySeat, kind, value: held ? 0 : 1 });
                  }}
                >
                  {label}
                </MenuItem>
              );
            })}
            <MenuItem
              onClick={() => {
                /*
                 * Ranger sa main d'un coup. On envoie un déplacement par carte,
                 * dans l'ordre voulu : `MOVE_CARDS` insérerait tout le lot au
                 * même index et renverserait le tri. Aucun de ces déplacements
                 * n'écrit au journal — ranger n'est pas jouer.
                 */
                const state = useGame.getState();
                const hand = [...state.cards.values()]
                  .filter((c) => c.zone.seat === mySeat && c.zone.kind === 'HAND')
                  .sort((a, b) => a.sortIndex - b.sortIndex);
                sortedHand(hand).forEach((id, index) => {
                  send({ type: 'MOVE_CARD', cardId: id, to: { seat: mySeat, kind: 'HAND' }, index });
                });
                close();
              }}
            >
              Trier la main
            </MenuItem>
            <MenuItem
              onClick={() => {
                /*
                 * Ranger ses terrains d'un coup, selon le réglage du joueur
                 * (« Disposition des terrains », dans les réglages de siège).
                 *
                 * **L'ordre n'est pas touché ici, et c'est le choix qui compte
                 * à cet endroit.** Trier les terrains par nom avant de les
                 * placer serait le premier réflexe — on aime voir ses Plaines
                 * ensemble — et ce serait un défaut invisible depuis ce
                 * fichier : sur le champ de bataille, tous les permanents non
                 * attachés partagent le même `zIndex` (30), si bien que le
                 * recouvrement suit l'**ordre de peinture**, c'est-à-dire
                 * l'ordre du tableau `battlefield`, lui-même issu de l'ordre de
                 * la `Map` `cards`. Réordonner les positions sans pouvoir
                 * réordonner la peinture donne un éventail qui se recouvre
                 * tantôt vers la gauche, tantôt vers la droite.
                 *
                 * On parcourt donc les terrains dans l'ordre de `cards`, qui
                 * *est* l'ordre de peinture, et l'on passe cet ordre-là à
                 * `landSlots`. Le regroupement par type, lui, est une **forme**
                 * de disposition et vit dans `lib/landLayout.ts`, qui groupe en
                 * interne puis redistribue les positions dans l'ordre reçu —
                 * et qui dit, à `pileSlots`, ce que ce regroupement coûte
                 * exactement au recouvrement.
                 *
                 * Le nom de la carte est joint parce que c'est lui qui décide
                 * des piles ; les trois autres formes l'ignorent. Une fiche
                 * absente du cache ne peut pas arriver ici — le filtre
                 * ci-dessous lit déjà sa ligne de type —, mais l'identifiant
                 * Scryfall sert de repli plutôt que de faire tomber tous les
                 * inconnus dans une même pile.
                 *
                 * Un `MOVE_CARD` par terrain, car `MOVE_CARDS` ne porte qu'un
                 * seul couple `x`/`y` pour tout le lot. Aucun de ces
                 * déplacements n'écrit au journal : ranger n'est pas jouer.
                 *
                 * Reste une limite : un terrain dont la fiche n'est pas encore
                 * en cache n'est pas reconnu et n'est pas rangé. En pratique
                 * elle ne se voit pas — un permanent déjà peint a sa fiche —,
                 * et le geste se rejoue sans dommage.
                 */
                close();
                void loadLandLayout().then((layout) => {
                  const state = useGame.getState();
                  const lands = [...state.cards.values()].filter(
                    (c) =>
                      c.zone.seat === mySeat &&
                      c.zone.kind === 'BATTLEFIELD' &&
                      // Un terrain attaché à autre chose est placé par la mise
                      // en page des attachements : le déplacer ne ferait rien.
                      c.attachedTo === undefined &&
                      // Une carte face cachée ne dit pas ce qu'elle est ; on ne
                      // la range pas en devinant que c'est un terrain.
                      !c.faceDown &&
                      isLandTypeLine(cardMeta(c.scryfallId)?.typeLine),
                  );
                  const slots = landSlots(
                    // La branche « face cachée » est morte : le filtre
                    // ci-dessus l'a écartée. Elle n'est là que parce que
                    // `filter` ne restreint pas le type de ce qu'il rend.
                    lands.map((c) => ({
                      key: c.faceDown ? c.id : (cardMeta(c.scryfallId)?.name ?? c.scryfallId),
                    })),
                    layout,
                  );
                  lands.forEach((land, rank) => {
                    const slot = slots[rank];
                    if (!slot) return;
                    send({
                      type: 'MOVE_CARD',
                      cardId: land.id,
                      to: land.zone,
                      x: slot.x,
                      y: slot.y,
                    });
                  });
                });
              }}
            >
              Aligner les terrains
            </MenuItem>
            <MenuItem onClick={() => { send({ type: 'SHUFFLE', zone: { seat: mySeat, kind: 'LIBRARY' } }); close(); }}>
              Mélanger la bibliothèque
            </MenuItem>
            <MenuItem
              onClick={() => {
                send({ type: 'LOOK', zone: { seat: mySeat, kind: 'LIBRARY' }, count: 1, mode: 'SCRY' });
                close();
              }}
            >
              Scry 1
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askNumber({
                  title: 'Regarder combien de cartes du dessus ?',
                  label: 'Nombre de cartes',
                  initial: 2,
                  quick: [1, 2, 3, 5],
                }).then((n) => {
                  if (n !== null) {
                    send({ type: 'LOOK', zone: { seat: mySeat, kind: 'LIBRARY' }, count: n, mode: 'SCRY' });
                  }
                });
              }}
            >
              Regarder N cartes du dessus…
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askNumber({
                  title: 'Surveil combien ?',
                  label: 'Nombre de cartes',
                  initial: 1,
                  quick: [1, 2, 3, 5],
                }).then((n) => {
                  if (n !== null) {
                    send({ type: 'LOOK', zone: { seat: mySeat, kind: 'LIBRARY' }, count: n, mode: 'SURVEIL' });
                  }
                });
              }}
            >
              Surveil…
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askNumber({
                  title: 'Meuler combien de cartes ?',
                  label: 'Nombre de cartes',
                  initial: 1,
                  quick: [1, 2, 3, 5, 10],
                }).then((n) => {
                  if (n !== null) send({ type: 'MILL', count: n });
                });
              }}
            >
              Mill…
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askNumber({
                  title: 'Exiler combien de cartes du dessus ?',
                  label: 'Nombre de cartes',
                  initial: 1,
                  quick: [1, 2, 3, 5],
                }).then((n) => {
                  if (n !== null) send({ type: 'EXILE_TOP', count: n });
                });
              }}
            >
              Exiler le dessus…
            </MenuItem>
            <MenuItem
              onClick={() => {
                send({ type: 'LOOK', zone: { seat: mySeat, kind: 'LIBRARY' }, count: 'ALL', mode: 'SEARCH' });
                close();
              }}
            >
              Fouiller la bibliothèque
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askNumber({
                  title: 'Défausser combien de cartes au hasard ?',
                  label: 'Nombre de cartes',
                  initial: 1,
                  quick: [1, 2, 3],
                }).then((n) => {
                  if (n !== null) send({ type: 'RANDOM_DISCARD', count: n });
                });
              }}
            >
              Défausse au hasard…
            </MenuItem>
            <MenuItem onClick={() => { send({ type: 'REVEAL_HAND', toSeats: 'ALL' }); close(); }}>
              Révéler sa main
            </MenuItem>
            {/* Même geste, mais à qui l'on veut : `REVEAL_HAND` accepte une
                liste de sièges, et rien ne permettait de la composer. */}
            {seats.filter((s) => s.id !== mySeat).length > 0 && (
              <MenuItem
                onClick={() => {
                  close();
                  void openDialog({
                    title: 'Révéler sa main à…',
                    description: 'Seules les personnes cochées verront votre main.',
                    choicesLabel: 'Destinataires',
                    choices: seats
                      .filter((s) => s.id !== mySeat)
                      .map((s) => ({ id: s.id, label: s.displayName, color: s.color })),
                    requireChoice: true,
                    submitLabel: 'Révéler',
                  }).then((result) => {
                    if (result) send({ type: 'REVEAL_HAND', toSeats: result.chosen });
                  });
                }}
              >
                Révéler sa main à…
              </MenuItem>
            )}
            <MenuItem onClick={() => { send({ type: 'END_TURN' }); close(); }}>Passer le tour</MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void askConfirm('Scoop', {
                  description: 'Ranger tout votre jeu dans la bibliothèque et mélanger ?',
                  submitLabel: 'Tout ranger',
                }).then((yes) => {
                  if (yes) send({ type: 'SCOOP' });
                });
              }}
            >
              Scoop (tout ranger et mélanger)
            </MenuItem>
            <MenuItem onClick={() => { onOpenSettings(); close(); }}>{t('toolbar.playmat')}…</MenuItem>
            <MenuItem onClick={() => { onOpenHelp(); close(); }}>Raccourcis clavier</MenuItem>
            <MenuItem
              danger
              onClick={() => {
                close();
                void askConfirm('Concéder la partie ?', {
                  description: 'Vous quittez la partie en cours. Ce geste ne se reprend pas.',
                  submitLabel: 'Concéder',
                }).then((yes) => {
                  if (yes) send({ type: 'CONCEDE' });
                });
              }}
            >
              Concéder
            </MenuItem>
          </Menu>
        )}
      </div>
    </div>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }): React.ReactElement {
  // Échap ferme, comme pour tout autre menu de la table.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/*
        Borné à la fenêtre, et défilant : le menu Actions compte une vingtaine
        d'entrées, et sur un portable (650 px utiles) les dernières — Concéder,
        les raccourcis — tombaient hors de l'écran, sans moyen de les atteindre.
        `z-40` : au-dessus du rail de main (`z-20`) et de la réserve de mana
        (`z-30`), qui le recouvraient.
      */}
      <div className="scrollbar-thin absolute right-0 z-40 mt-1.5 max-h-[calc(100vh-4.5rem)] w-60 overflow-y-auto rounded-xl border border-slate-700/90 bg-slate-900/95 py-1.5 shadow-2xl shadow-black/80 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
        {children}
      </div>
    </>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}): React.ReactElement {
  return (
    <button
      className={`block w-full px-3 py-1.5 text-left text-xs sm:text-sm font-medium transition-colors ${
        danger ? 'text-rose-300 hover:bg-rose-950/80 hover:text-rose-100' : 'text-slate-200 hover:bg-slate-800 hover:text-white'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Pastilles d'aléa : tactiles, violet moderne, bordure subtile */
const DICE =
  'flex-auto whitespace-nowrap rounded-lg border border-purple-500/40 bg-purple-900/60 hover:bg-purple-800/80 px-2 py-1.5 text-xs font-semibold text-purple-100 shadow-sm backdrop-blur transition-all active:scale-95 text-center';

export function DiceBar(): React.ReactElement {
  const send = useGame((s) => s.send);
  return (
    <div className="pointer-events-auto flex gap-2">
      <button
        className={DICE}
        onClick={() => send({ type: 'ROLL_DIE', sides: 20 })}
      >
        d20
      </button>
      <button
        className={DICE}
        onClick={() => {
          void askNumber({
            title: 'Lancer un dé',
            label: 'Nombre de faces',
            initial: 6,
            min: 2,
            quick: [4, 6, 8, 10, 12, 20, 100],
            submitLabel: 'Lancer',
          }).then((sides) => {
            if (sides !== null) send({ type: 'ROLL_DIE', sides });
          });
        }}
      >
        Autre dé…
      </button>
      <button
        className={DICE}
        onClick={() => send({ type: 'FLIP_COIN' })}
      >
        Pile ou face
      </button>
    </div>
  );
}
