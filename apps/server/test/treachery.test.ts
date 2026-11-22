/**
 * Treachery : distribution des identités, étanchéité, dévoilement, victoire.
 *
 * Règles de référence : https://mtgtreachery.net/rules/cr/ (907, 702.TR01).
 *
 * L'étanchéité est vérifiée **sur ce qui sort réellement** — chaque message
 * reçu par chaque connexion, snapshots et deltas compris — et non sur l'état :
 * une identité secrète qui n'apparaît dans aucun message n'a pas fui, quelle
 * que soit la manière dont le serveur la range.
 */
import { describe, expect, it } from 'vitest';
import {
  TREACHERY_IDENTITIES,
  treacheryDistribution,
  treacheryIdentity,
  type SeatId,
  type ServerMessage,
  type TreacheryIdentityView,
  type TreacheryRole,
} from '@mtg/shared';
import { seatTable, fakeConnection, type FakeConnection, type Table } from './fixture.js';
import { dumpState } from '../src/replay/dump.js';
import { projectOrigin } from '../src/replay/projection.js';

async function treacheryTable(count: number, seed = 42): Promise<Table> {
  const table = seatTable(count, seed, 'TREACHERY');
  table.room.startGame('seat_0');
  return table;
}

/** Toutes les identités qu'un message porte, où qu'elles soient. */
function identitiesIn(message: ServerMessage): TreacheryIdentityView[] {
  const out: TreacheryIdentityView[] = [];
  if (message.t === 'event' && message.event.type === 'IDENTITY_SHOWN') {
    out.push(message.event.identity);
  }
  if (message.t === 'hello') {
    out.push(...(message.snapshot?.treachery?.identities ?? []));
    for (const event of message.delta ?? []) out.push(...identitiesIn(event));
  }
  return out;
}

function seenBy(conn: FakeConnection): TreacheryIdentityView[] {
  return conn.received.flatMap(identitiesIn);
}

function seatsOf(table: Table, role: TreacheryRole): SeatId[] {
  return [...table.room.state.treachery!.identities.values()]
    .filter((i) => i.role === role)
    .map((i) => i.seat);
}

function connOf(table: Table, seat: SeatId): FakeConnection {
  return table.seats.find((c) => c.seatId === seat)!;
}

async function concede(table: Table, seat: SeatId): Promise<void> {
  await table.room.handleIntent(connOf(table, seat), `concede-${seat}`, { type: 'CONCEDE' });
}

function gameEnded(conn: FakeConnection) {
  for (const m of conn.received) {
    if (m.t === 'event' && m.event.type === 'GAME_ENDED') return m.event;
  }
  return undefined;
}

describe('distribution', () => {
  it.each([4, 5, 6, 7, 8])('suit la répartition officielle à %i joueurs', async (count) => {
    const table = await treacheryTable(count);
    const treachery = table.room.state.treachery!;
    const expected = treacheryDistribution(count)!;

    expect(treachery.distribution).toEqual(expected);
    expect(treachery.identities.size).toBe(count);
    for (const role of ['LEADER', 'GUARDIAN', 'ASSASSIN', 'TRAITOR'] as const) {
      expect(seatsOf(table, role)).toHaveLength(expected[role]);
    }
  });

  it('donne à chacun une carte de son rôle, sans doublon', async () => {
    const table = await treacheryTable(8);
    const identities = [...table.room.state.treachery!.identities.values()];

    for (const identity of identities) {
      expect(treacheryIdentity(identity.cardId)?.role).toBe(identity.role);
    }
    expect(new Set(identities.map((i) => i.cardId)).size).toBe(identities.length);
  });

  it('ne tire pas toujours la même distribution', async () => {
    const leaders = new Set<SeatId>();
    for (let seed = 1; seed <= 12; seed++) {
      leaders.add(seatsOf(await treacheryTable(5, seed), 'LEADER')[0]!);
    }
    expect(leaders.size).toBeGreaterThan(1);
  });

  it('révèle le Leader et le fait commencer', async () => {
    const table = await treacheryTable(5);
    const [leader] = seatsOf(table, 'LEADER');

    expect(table.room.state.activeSeat).toBe(leader);
    expect(table.room.state.treachery!.identities.get(leader!)!.unveiled).toBe(true);
    for (const conn of table.seats) {
      expect(seenBy(conn).some((i) => i.seat === leader && i.role === 'LEADER')).toBe(true);
    }
  });

  it('refuse de lancer à trois joueurs', () => {
    const table = seatTable(3, 42, 'TREACHERY');

    expect(() => table.room.startGame('seat_0')).toThrow(/4 à 8/);
    expect(table.room.state.status).toBe('LOBBY');
    expect(table.room.state.treachery).toBeUndefined();
  });

  it('couvre les quatre rôles dans le catalogue', () => {
    for (const role of ['LEADER', 'GUARDIAN', 'ASSASSIN', 'TRAITOR'] as const) {
      // Huit joueurs demandent jusqu'à trois Assassins : il faut de quoi servir.
      expect(TREACHERY_IDENTITIES.filter((c) => c.role === role).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('sièges', () => {
  it('accepte huit joueurs en Treachery, et pas un neuvième', () => {
    const table = seatTable(8, 42, 'TREACHERY');
    expect(table.room.state.seats.size).toBe(8);

    const extra = fakeConnection('conn-extra');
    table.room.addConnection(extra);
    expect(() => table.room.sitDown(extra, 7, 'Ivan', null)).toThrow();
  });

  it('garde le plafond de quatre hors Treachery', () => {
    const table = seatTable(4);
    const extra = fakeConnection('conn-extra');
    table.room.addConnection(extra);

    expect(() => table.room.sitDown(extra, 4, 'Erin', null)).toThrow(/complète/);
  });

  it('refuse un nouveau venu une fois la partie lancée', async () => {
    const table = await treacheryTable(5);
    const extra = fakeConnection('conn-extra');
    table.room.addConnection(extra);

    expect(() => table.room.sitDown(extra, 5, 'Frank', null)).toThrow(/en cours/);
    expect(table.room.state.seats.size).toBe(5);
  });
});

describe('étanchéité', () => {
  it.each([4, 5, 6, 7, 8])(
    'ne remet à personne l’identité secrète d’un autre (%i joueurs)',
    async (count) => {
      const table = await treacheryTable(count);
      const [leader] = seatsOf(table, 'LEADER');

      for (const conn of table.seats) {
        const seen = seenBy(conn);
        // Sa propre carte, et le Leader : rien d'autre n'a le droit d'exister.
        expect(seen.some((i) => i.seat === conn.seatId)).toBe(true);
        for (const identity of seen) {
          expect([conn.seatId, leader]).toContain(identity.seat);
        }
      }
    },
  );

  it('ne laisse aucune trace d’un rôle secret dans les trames brutes', async () => {
    const table = await treacheryTable(5);
    const secrets = [...table.room.state.treachery!.identities.values()].filter((i) => !i.unveiled);

    for (const conn of table.seats) {
      const wire = conn.frames.join('\n');
      for (const secret of secrets) {
        if (secret.seat === conn.seatId) continue;
        // Le nom de la carte ne voyage pas (seul son numéro voyage), et le
        // numéro ne doit apparaître que dans une identité que ce siège a reçue.
        expect(wire).not.toContain(`"seat":"${secret.seat}","displayName"`);
      }
    }
  });

  it('tient aussi par le snapshot et par le delta de rattrapage', async () => {
    const table = await treacheryTable(6);
    const [leader] = seatsOf(table, 'LEADER');

    for (const conn of table.seats) {
      const seat = conn.seatId!;
      const snapshot = table.room.snapshotFor(seat);
      expect(snapshot.treachery!.identities.map((i) => i.seat).sort()).toEqual(
        [...new Set([seat, leader!])].sort(),
      );

      const delta = table.room.deltaFor(seat, table.room.state.seats.get(seat)!.joinedAtSeq) ?? [];
      for (const identity of delta.flatMap(identitiesIn)) {
        expect([seat, leader]).toContain(identity.seat);
      }
    }
  });

  it('ne dit rien à une connexion sans siège', async () => {
    const table = await treacheryTable(5);
    expect(table.room.snapshotFor(null).treachery).toBeUndefined();
  });

  it('garde le secret dans le journal', async () => {
    const table = await treacheryTable(5);
    const text = table.room.state.log.map((l) => l.text).join('\n');

    for (const identity of table.room.state.treachery!.identities.values()) {
      if (identity.unveiled) continue;
      expect(text).not.toContain(treacheryIdentity(identity.cardId)!.name);
    }
  });

  it('tient dans le replay, vue par siège', async () => {
    const table = await treacheryTable(5);
    const origin = JSON.parse(JSON.stringify(dumpState(table.room.state)));
    const [leader] = seatsOf(table, 'LEADER');
    const [assassin] = seatsOf(table, 'ASSASSIN');

    const seen = projectOrigin(origin, assassin!).treachery!.identities.map((i) => i.seat);
    expect(seen.sort()).toEqual([assassin!, leader!].sort());
    // La vue omnisciente, elle, montre tout : c'est sa raison d'être.
    expect(projectOrigin(origin, 'ALL').treachery!.identities).toHaveLength(5);
  });
});

describe('dévoilement', () => {
  it('rend l’identité publique, une fois pour toutes', async () => {
    const table = await treacheryTable(5);
    const [traitor] = seatsOf(table, 'TRAITOR');
    for (const conn of table.seats) conn.received.length = 0;

    await table.room.handleIntent(connOf(table, traitor!), 'unveil', { type: 'UNVEIL' });

    for (const conn of table.seats) {
      expect(seenBy(conn)).toEqual([
        expect.objectContaining({ seat: traitor, role: 'TRAITOR', unveiled: true }),
      ]);
    }
    expect(table.room.state.log.at(-1)!.text).toMatch(/dévoile son identité/);
    // Un dévoilement ne décide de rien : la partie continue.
    expect(table.room.state.status).toBe('PLAYING');

    const conn = connOf(table, traitor!);
    conn.received.length = 0;
    await table.room.handleIntent(conn, 'again', { type: 'UNVEIL' });
    expect(conn.received.find((m) => m.t === 'reject')).toBeDefined();
  });

  it('ne s’annule pas', async () => {
    const table = await treacheryTable(5);
    const [assassin] = seatsOf(table, 'ASSASSIN');
    const conn = connOf(table, assassin!);

    await table.room.handleIntent(conn, 'unveil', { type: 'UNVEIL' });
    conn.received.length = 0;
    await table.room.handleIntent(conn, 'undo', { type: 'UNDO_LAST' });

    expect(conn.received.find((m) => m.t === 'reject')).toBeDefined();
    expect(table.room.state.treachery!.identities.get(assassin!)!.unveiled).toBe(true);
  });

  it('n’existe pas hors Treachery', async () => {
    const table = seatTable(4);
    table.room.startGame('seat_0');
    table.a.received.length = 0;

    await table.room.handleIntent(table.a, 'unveil', { type: 'UNVEIL' });
    expect(table.a.received.find((m) => m.t === 'reject')).toBeDefined();
  });
});

describe('élimination', () => {
  it('révèle l’identité de celui qui concède', async () => {
    const table = await treacheryTable(5);
    const [first] = seatsOf(table, 'ASSASSIN');
    for (const conn of table.seats) conn.received.length = 0;

    await concede(table, first!);

    for (const conn of table.seats) {
      expect(seenBy(conn)).toEqual([
        expect.objectContaining({ seat: first, role: 'ASSASSIN', unveiled: true }),
      ]);
    }
    expect(table.room.state.status).toBe('PLAYING');
  });

  it('révèle l’identité de celui qui quitte la table', async () => {
    const table = await treacheryTable(5);
    const [guardian] = seatsOf(table, 'GUARDIAN');
    const witness = connOf(table, seatsOf(table, 'LEADER')[0]!);
    witness.received.length = 0;

    table.room.standUp(connOf(table, guardian!), { force: true });

    expect(seenBy(witness)).toEqual([
      expect.objectContaining({ seat: guardian, role: 'GUARDIAN', unveiled: true }),
    ]);
    expect(table.room.state.status).toBe('PLAYING');
  });
});

describe('victoire', () => {
  it('donne la partie au Leader et à ses Gardiens quand Assassins et Traîtres sont tombés', async () => {
    const table = await treacheryTable(5);
    const [leader] = seatsOf(table, 'LEADER');
    const [guardian] = seatsOf(table, 'GUARDIAN');

    for (const seat of [...seatsOf(table, 'ASSASSIN'), ...seatsOf(table, 'TRAITOR')]) {
      expect(table.room.state.status).toBe('PLAYING');
      await concede(table, seat);
    }

    expect(table.room.state.status).toBe('ENDED');
    const ended = gameEnded(table.a)!;
    expect(ended.team).toBe('LEADER');
    expect([...ended.winners].sort()).toEqual([leader!, guardian!].sort());
  });

  it('compte un Gardien éliminé parmi les vainqueurs de son équipe', async () => {
    const table = await treacheryTable(5);
    const [leader] = seatsOf(table, 'LEADER');
    const [guardian] = seatsOf(table, 'GUARDIAN');

    await concede(table, guardian!);
    for (const seat of [...seatsOf(table, 'ASSASSIN'), ...seatsOf(table, 'TRAITOR')]) {
      await concede(table, seat);
    }

    expect([...gameEnded(table.a)!.winners].sort()).toEqual([leader!, guardian!].sort());
  });

  it('donne la partie aux Assassins dès que le Leader tombe, éliminés compris', async () => {
    const table = await treacheryTable(5);
    const assassins = seatsOf(table, 'ASSASSIN');

    await concede(table, assassins[0]!);
    await concede(table, seatsOf(table, 'LEADER')[0]!);

    expect(table.room.state.status).toBe('ENDED');
    const ended = gameEnded(table.a)!;
    expect(ended.team).toBe('ASSASSINS');
    expect([...ended.winners].sort()).toEqual([...assassins].sort());
  });

  it('donne la partie au Traître si le Leader tombe après tous les Assassins', async () => {
    const table = await treacheryTable(5);
    const [traitor] = seatsOf(table, 'TRAITOR');

    for (const seat of seatsOf(table, 'ASSASSIN')) await concede(table, seat);
    expect(table.room.state.status).toBe('PLAYING');
    // Un Gardien est encore là : il perd avec son Leader (907.8b).
    await concede(table, seatsOf(table, 'LEADER')[0]!);

    const ended = gameEnded(table.a)!;
    expect(ended.team).toBe('TRAITOR');
    expect(ended.winners).toEqual([traitor]);
  });

  it('fait continuer deux Traîtres jusqu’à ce qu’il n’en reste qu’un', async () => {
    const table = await treacheryTable(8);
    const traitors = seatsOf(table, 'TRAITOR');
    expect(traitors).toHaveLength(2);

    for (const seat of seatsOf(table, 'ASSASSIN')) await concede(table, seat);
    await concede(table, seatsOf(table, 'LEADER')[0]!);
    // Deux Traîtres en jeu : ils ne sont pas alliés (907.8d).
    expect(table.room.state.status).toBe('PLAYING');

    await concede(table, traitors[0]!);
    const ended = gameEnded(table.a)!;
    expect(ended.team).toBe('TRAITOR');
    expect(ended.winners).toEqual([traitors[1]]);
  });

  it('décide la partie quand le Leader tombe devant un dernier adversaire', async () => {
    const table = await treacheryTable(5);

    for (const seat of [...seatsOf(table, 'ASSASSIN'), ...seatsOf(table, 'TRAITOR')].slice(0, 2)) {
      await concede(table, seat);
    }
    // Reste un adversaire : on le fait partir en dernier, après le Leader.
    const last = [...seatsOf(table, 'ASSASSIN'), ...seatsOf(table, 'TRAITOR')][2]!;
    const lastRole = table.room.state.treachery!.identities.get(last)!.role;
    await concede(table, seatsOf(table, 'LEADER')[0]!);

    // Selon le tirage, le dernier adversaire est un Assassin (ils gagnent) ou
    // le Traître (il gagne) : dans les deux cas la partie est décidée ici.
    expect(table.room.state.status).toBe('ENDED');
    expect(gameEnded(table.a)!.team).toBe(lastRole === 'ASSASSIN' ? 'ASSASSINS' : 'TRAITOR');
  });

  it('décide aussi sur un départ', async () => {
    const table = await treacheryTable(5);
    const leader = seatsOf(table, 'LEADER')[0]!;
    const witness = connOf(table, seatsOf(table, 'ASSASSIN')[0]!);

    table.room.standUp(connOf(table, leader!), { force: true });

    expect(table.room.state.status).toBe('ENDED');
    expect(gameEnded(witness)!.team).toBe('ASSASSINS');
  });

  it('retourne toutes les identités à la fin', async () => {
    const table = await treacheryTable(6);
    await concede(table, seatsOf(table, 'LEADER')[0]!);

    for (const conn of table.seats) {
      expect(table.room.snapshotFor(conn.seatId).treachery!.identities).toHaveLength(6);
      expect(new Set(seenBy(conn).map((i) => i.seat)).size).toBe(6);
    }
  });
});

describe('relance', () => {
  it('oublie les identités, puis en redistribue', async () => {
    const table = await treacheryTable(5);
    for (const conn of table.seats) conn.received.length = 0;

    await table.room.handleIntent(table.a, 'restart', { type: 'RESTART_GAME', keepDecks: true });

    expect(table.room.state.treachery).toBeUndefined();
    expect(table.room.snapshotFor('seat_0').treachery).toBeUndefined();
    expect(
      table.b.received.some(
        (m) => m.t === 'event' && m.event.type === 'TREACHERY_SETUP' && m.event.distribution === null,
      ),
    ).toBe(true);

    table.room.startGame('seat_0');
    expect(table.room.state.treachery!.identities.size).toBe(5);
  });
});
