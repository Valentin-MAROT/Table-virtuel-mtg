/**
 * Treachery, côté affichage : ce que le client **montre** d'un rôle.
 *
 * Rien ici ne décide de qui voit quoi — le serveur n'envoie que les identités
 * que ce client a le droit de connaître, et l'on n'affiche que celles-là.
 */
import { TREACHERY_ROLES, type TreacheryDistribution, type TreacheryRole } from '@mtg/shared';
import type { BoundT } from './i18n/translate.js';

/**
 * Teinte de chaque rôle. Elle n'est **jamais seule à porter le sens** : partout
 * où elle apparaît, le nom du rôle est écrit à côté. Elle sert à retrouver d'un
 * coup d'œil une étiquette déjà lue, pas à la remplacer.
 */
export const ROLE_TINT: Record<TreacheryRole, { text: string; border: string; bg: string }> = {
  LEADER: { text: '#fcd34d', border: '#b45309', bg: 'rgb(120 53 15 / 45%)' },
  GUARDIAN: { text: '#7dd3fc', border: '#0369a1', bg: 'rgb(12 74 110 / 45%)' },
  ASSASSIN: { text: '#fca5a5', border: '#b91c1c', bg: 'rgb(127 29 29 / 45%)' },
  TRAITOR: { text: '#d8b4fe', border: '#7e22ce', bg: 'rgb(88 28 135 / 45%)' },
};

export function roleName(t: BoundT, role: TreacheryRole): string {
  return t(`treachery.role.${role}`);
}

/** « 1 Leader, 1 Gardien, 2 Assassins, 1 Traître » — la répartition, en clair. */
export function distributionText(t: BoundT, distribution: TreacheryDistribution): string {
  return TREACHERY_ROLES.filter((role) => distribution[role] > 0)
    .map((role) => `${distribution[role]} × ${roleName(t, role)}`)
    .join(', ');
}
