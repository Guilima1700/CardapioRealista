import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/lib/seed";
import {
  priceCart,
  checkoutSchema,
  assertTransition,
  productSchema,
  settingsSchema,
} from "../src/lib/validation";
const line = {
  productId: "brasa-classic",
  quantity: 2,
  modifierIds: ["brioche", "medium", "bacon"],
  notes: "Sem tomate",
};
test("preço em centavos inclui adicionais e quantidade", () => {
  const [result] = priceCart([line], seed);
  assert.equal(result.unitPrice, 3890);
  assert.equal(result.total, 7780);
  assert.equal(result.modifiers.length, 3);
});
test("ignora preço adulterado enviado no navegador", () => {
  const [result] = priceCart(
    [{ ...line, unitPrice: 1, total: 1 } as typeof line],
    seed,
  );
  assert.equal(result.total, 7780);
});
test("rejeita produto indisponível", () => {
  const catalog = structuredClone(seed);
  catalog.products[0].available = false;
  assert.throws(() => priceCart([line], catalog), /indisponível/);
});
test("rejeita adicionais duplicados", () =>
  assert.throws(
    () =>
      priceCart(
        [{ ...line, modifierIds: ["brioche", "medium", "bacon", "bacon"] }],
        seed,
      ),
    /duplicados/,
  ));
test("rejeita adicional de outro produto ou inexistente", () =>
  assert.throws(
    () =>
      priceCart(
        [{ ...line, modifierIds: ["brioche", "medium", "inexistente"] }],
        seed,
      ),
    /inválido/,
  ));
test("exige grupos obrigatórios", () =>
  assert.throws(
    () => priceCart([{ ...line, modifierIds: ["bacon"] }], seed),
    /Seu pão/,
  ));
test("impede múltiplas opções em um grupo de escolha única", () =>
  assert.throws(
    () =>
      priceCart(
        [{ ...line, modifierIds: ["brioche", "australian", "medium"] }],
        seed,
      ),
    /Seu pão/,
  ));
test("rejeita quantidade negativa, fracionada e excessiva", () => {
  for (const quantity of [-1, 0, 1.5, 21])
    assert.throws(() => priceCart([{ ...line, quantity }], seed), /Quantidade/);
});
test("checkout exige mesa, chave UUID, pagamento e carrinho não vazio", () => {
  assert.equal(checkoutSchema.safeParse({ items: [] }).success, false);
  assert.equal(
    checkoutSchema.safeParse({
      tableToken: "demo",
      idempotencyKey: crypto.randomUUID(),
      payment: "cashier",
      items: [line],
    }).success,
    true,
  );
});
test("status segue apenas a próxima etapa", () => {
  assert.doesNotThrow(() => assertTransition("confirmed", "preparing"));
  assert.throws(() => assertTransition("confirmed", "ready"));
  assert.throws(() => assertTransition("ready", "preparing"));
  assert.throws(() => assertTransition("delivered", "received"));
});
test("catálogo de demonstração passa pela validação de produtos", () => {
  for (const p of seed.products)
    assert.equal(
      productSchema.safeParse(p).success,
      true,
      JSON.stringify(productSchema.safeParse(p)),
    );
});
test("configuração rejeita cor CSS arbitrária e pagamento fictício", () => {
  assert.equal(settingsSchema.safeParse(seed.settings).success, true);
  assert.equal(
    settingsSchema.safeParse({
      ...seed.settings,
      color: "url(https://example.com)",
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...seed.settings, payments: ["online"] })
      .success,
    false,
  );
});
