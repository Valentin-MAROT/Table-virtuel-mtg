/**
 * Le délai annoncé par le seau à jetons.
 *
 * Ces tests existent pour un défaut précis : `retryAfter` **ne lisait pas son
 * paramètre `now`**. Le seau se recharge paresseusement, à l'intérieur de
 * `take` ; `state.tokens` porte donc le solde du **dernier appel à `take`**, pas
 * le solde courant. En le lisant tel quel, la méthode annonçait un délai figé —
 * et les quatre routes d'authentification renvoient ce chiffre à l'utilisateur
 * bloqué, qui le voyait ne jamais descendre.
 */
import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../src/lib/throttle.js';

/** Un seau étroit : trois essais de rafale, un jeton regagné par seconde. */
const options = { capacity: 3, refillPerSecond: 1 };

describe('délai avant nouvelle tentative', () => {
  it('décroît à mesure que le temps passe, sans nouvel appel à take', () => {
    const bucket = new TokenBucket(options);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(bucket.take('ip', 1, t0)).toBe(true);
    expect(bucket.take('ip', 1, t0)).toBe(false);

    // Au moment du refus, il faut attendre une seconde pleine.
    expect(bucket.retryAfter('ip', t0)).toBe(1);

    /*
     * Le cœur du défaut : l'utilisateur patiente, mais ne retente pas — donc
     * `take` n'est pas rappelé, donc rien ne recharge le seau. La réponse
     * restait « 1 seconde », indéfiniment.
     */
    expect(bucket.retryAfter('ip', t0 + 500)).toBe(1);
    expect(bucket.retryAfter('ip', t0 + 1_000)).toBe(0);
    expect(bucket.retryAfter('ip', t0 + 60_000)).toBe(0);
  });

  it('ne consomme rien et ne déplace pas la recharge : demander n’est pas essayer', () => {
    const bucket = new TokenBucket(options);
    const t0 = 2_000_000;
    for (let i = 0; i < 3; i++) bucket.take('ip', 1, t0);

    // Mille interrogations à l'instant du refus…
    for (let i = 0; i < 1_000; i++) bucket.retryAfter('ip', t0);

    // …ne doivent ni vider davantage le seau, ni repousser sa recharge : une
    // seconde plus tard, le jeton promis est bien là.
    expect(bucket.take('ip', 1, t0 + 1_000)).toBe(true);
  });

  it('ne promet rien pour une clé jamais vue', () => {
    const bucket = new TokenBucket(options);
    expect(bucket.retryAfter('inconnue', 3_000_000)).toBe(0);
  });

  it('plafonne au seau plein plutôt que de compter un crédit imaginaire', () => {
    const bucket = new TokenBucket(options);
    const t0 = 4_000_000;
    bucket.take('ip', 3, t0);
    // Une heure d'inactivité ne rend pas 3 600 jetons : la capacité est le toit,
    // et `retryAfter` doit lire le même toit que `take`.
    expect(bucket.retryAfter('ip', t0 + 3_600_000)).toBe(0);
    expect(bucket.take('ip', 3, t0 + 3_600_000)).toBe(true);
    expect(bucket.take('ip', 1, t0 + 3_600_000)).toBe(false);
  });
});
