/**
 * Le mulligan se confirme.
 *
 * C'est le seul geste du menu de bibliothèque qui jette une main entière, et il
 * partait au premier clic — entre « Mélanger » et la ligne du dessous, là où le
 * doigt glisse. Comme Scoop et Concéder, il passe par `askConfirm`.
 */
import type { Intent } from '@mtg/shared';
import { askConfirm } from '../components/Dialog.js';

export async function mulliganWithConfirm(send: (intent: Intent) => unknown, free = false): Promise<void> {
  const ok = await askConfirm(free ? 'Prendre un mulligan gratuit ?' : 'Prendre un mulligan ?', {
    description: free
      ? 'Votre main repart dans la bibliothèque, mélangée, et vous en piochez sept nouvelles — sans carte de plus à remettre dessous.'
      : 'Votre main repart dans la bibliothèque, mélangée, et vous en piochez une nouvelle. Une carte de plus à remettre dessous en la gardant.',
    submitLabel: free ? 'Mulligan gratuit' : 'Mulligan',
  });
  if (ok) send(free ? { type: 'MULLIGAN', free: true } : { type: 'MULLIGAN' });
}
