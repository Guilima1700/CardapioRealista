import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  defaultExperienceSettings,
  requireParticipant,
  splitCents,
  transitionGroup,
  reviewSchema,
  type GroupState,
} from "../src/lib/experiences";
import { seed } from "../src/lib/seed";
function fixture(): GroupState {
  return {
    id: randomUUID(),
    tableId: "table-7",
    status: "editing",
    version: 1,
    ownerId: "a",
    joinClosed: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    createdAt: new Date().toISOString(),
    roundKey: randomUUID(),
    topic: "private-notifications",
    participants: [
      {
        id: "a",
        name: "Ana",
        secretHash: "hash-a",
        approved: true,
        joinedAt: "",
      },
      {
        id: "b",
        name: "Beto",
        secretHash: "hash-b",
        approved: true,
        joinedAt: "",
      },
    ],
    items: [
      {
        id: randomUUID(),
        participantId: "a",
        version: 1,
        productId: "brasa-classic",
        quantity: 1,
        modifierIds: ["brioche", "medium"],
        notes: "",
      },
    ],
    orders: [],
  };
}
test("divisão igualitária preserva cada centavo e é determinística", () => {
  assert.deepEqual(
    splitCents(100, ["a", "b", "c"]).map((x) => x.total),
    [34, 33, 33],
  );
  for (let total = 0; total < 500; total++)
    assert.equal(
      splitCents(total, ["a", "b", "c", "d"]).reduce((s, i) => s + i.total, 0),
      total,
    );
});
test("participante não altera item alheio; responsável pode remover com versão correta", () => {
  const s = fixture(),
    item = s.items[0];
  assert.throws(
    () =>
      transitionGroup(
        s,
        { action: "remove", itemId: item.id, version: 1 },
        s.participants[1],
        seed,
        defaultExperienceSettings,
        { itemId: randomUUID(), roundKey: randomUUID() },
      ),
    /próprios/,
  );
  assert.throws(
    () =>
      transitionGroup(
        s,
        { action: "remove", itemId: item.id, version: 2 },
        s.participants[0],
        seed,
        defaultExperienceSettings,
        { itemId: randomUUID(), roundKey: randomUUID() },
      ),
    /mudou/,
  );
});
test("revisão bloqueia edição e calcula valores do catálogo", () => {
  const s = fixture(),
    ids = { itemId: randomUUID(), roundKey: randomUUID() };
  transitionGroup(
    s,
    { action: "review" },
    s.participants[0],
    seed,
    defaultExperienceSettings,
    ids,
  );
  assert.equal(s.reviewTotal, 3290);
  assert.equal(s.joinClosed, true);
  assert.throws(
    () =>
      transitionGroup(
        s,
        {
          action: "add",
          item: { productId: "cola", quantity: 1, modifierIds: [], notes: "" },
        },
        s.participants[1],
        seed,
        defaultExperienceSettings,
        ids,
      ),
    /revisão/,
  );
});
test("sessão expirada, encerrada e token incorreto não autorizam participante", () => {
  const s = fixture();
  assert.throws(() => requireParticipant(s, "wrong"), /Entre/);
  assert.throws(
    () => requireParticipant(s, "hash-a", Date.now() + 120000),
    /expirou/,
  );
  s.status = "closed";
  assert.throws(() => requireParticipant(s, "hash-a"), /encerrada/);
});
test("avaliação valida três notas e não aceita categorias repetidas", () => {
  assert.equal(
    reviewSchema.safeParse({
      food: 1,
      service: 1,
      wait: 1,
      issues: ["cold_food"],
    }).success,
    true,
  );
  assert.equal(
    reviewSchema.safeParse({ food: 0, service: 6, wait: 3 }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      food: 3,
      service: 3,
      wait: 3,
      issues: ["cold_food", "cold_food"],
    }).success,
    false,
  );
});
