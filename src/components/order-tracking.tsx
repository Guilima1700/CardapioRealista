"use client";
import Link from "next/link";
import {
  Check,
  ChefHat,
  CheckCircle2,
  Flame,
  MapPin,
  ArrowLeft,
  ShoppingBag,
  Clock,
  WifiOff,
  UtensilsCrossed,
} from "lucide-react";
import { useLive } from "@/lib/use-live";
import { money, statuses, statusLabels, type Order } from "@/lib/types";
import { Brand } from "./ui";
import OrderReview from "./order-review";
export default function OrderTracking({
  initial,
  name,
  tableToken,
  timezone,
}: {
  initial: Order;
  name: string;
  tableToken: string;
  timezone: string;
}) {
  const { data: order, connected } = useLive<Order>(
    `/api/orders/${initial.trackingToken}`,
    { initial, orderToken: initial.trackingToken },
  );
  const step = statuses.indexOf(order.status);
  const messages = {
    received: [
      "Seu pedido chegou.",
      "A equipe vai confirmar e cuidar de tudo por aqui.",
    ],
    confirmed: [
      "Tudo certo com seu pedido!",
      `Já avisamos a cozinha. Em breve, seu momento ${name}.`,
    ],
    preparing: [
      "Tem coisa boa na cozinha.",
      "A cozinha está preparando cada detalhe do seu pedido.",
    ],
    ready: [
      "Seu pedido está pronto!",
      "A equipe já pode levar esse sabor até você.",
    ],
    delivered: [
      "Agora é com você.",
      "Aproveite cada mordida. Obrigado por estar aqui.",
    ],
  };
  return (
    <div className="tracking-app">
      <header className="simple-header">
        <Brand name={name} />
        <span className="table-pill">
          <MapPin size={15} />
          {order.tableName}
        </span>
      </header>
      <main className="tracking-shell">
        <Link
          className="back-link"
          href={`/?mesa=${encodeURIComponent(tableToken)}`}
        >
          <ArrowLeft size={16} /> Voltar ao cardápio
        </Link>
        <div className="tracking-heading">
          <div
            className={`tracking-flame ${order.status === "preparing" ? "pulse" : ""}`}
          >
            {step >= 3 ? <CheckCircle2 size={38} /> : <Flame size={38} />}
          </div>
          <span className="eyebrow">
            PEDIDO #{String(order.number).padStart(4, "0")}
          </span>
          <h1>{messages[order.status][0]}</h1>
          <p>{messages[order.status][1]}</p>
          <div className={`live-indicator ${connected ? "" : "offline"}`}>
            <i />
            {connected
              ? "Acompanhamento atualizado automaticamente"
              : "Reconectando — seu pedido continua registrado"}
          </div>
        </div>
        {!connected && (
          <p className="notice">
            <WifiOff size={16} /> Sem conexão com o servidor. Estamos tentando
            novamente.
          </p>
        )}
        <div className="tracking-steps">
          {statuses.map((status, i) => {
            const Icon = [
              ShoppingBag,
              Check,
              ChefHat,
              UtensilsCrossed,
              CheckCircle2,
            ][i];
            return (
              <div
                className={`tracking-step ${i <= step ? "done" : ""} ${i === step ? "current" : ""}`}
                key={status}
              >
                <span>
                  {i < step ? <Check size={20} /> : <Icon size={20} />}
                </span>
                <div>
                  <b>{statusLabels[status]}</b>
                  <small>
                    {order.history.find((h) => h.status === status)
                      ? new Date(
                          order.history.find((h) => h.status === status)!.at,
                        ).toLocaleTimeString("pt-BR", {
                          timeZone: timezone,
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Aguardando"}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
        <section className="order-receipt">
          <div className="receipt-heading">
            <h3>Seu momento {name}</h3>
            <span>{order.tableName}</span>
          </div>
          {order.items.map((item, i) => (
            <div className="receipt-item" key={i}>
              <span className="item-qty">{item.quantity}×</span>
              <div>
                <b>{item.name}</b>
                {item.participantName && (
                  <small className="participant-label">
                    {item.participantName}
                  </small>
                )}
                <small>{item.modifiers.map((m) => m.name).join(" · ")}</small>
                {item.notes && <p>Obs.: {item.notes}</p>}
              </div>
              <strong>{money(item.total)}</strong>
            </div>
          ))}
          <div className="cart-total">
            <span>Total</span>
            <strong>{money(order.total)}</strong>
          </div>
          <p className="fine-print">
            <Clock size={13} /> Pedido feito em{" "}
            {new Date(order.createdAt).toLocaleString("pt-BR", {
              timeZone: timezone,
            })}{" "}
            · Pagamento {order.payment === "cashier" ? "no caixa" : "na mesa"}.
            A confirmação do pedido não confirma pagamento.
          </p>
        </section>
        <OrderReview token={initial.trackingToken} status={order.status} />
        <p className="tracking-help">
          Precisa ajustar algo? Fale com nossa equipe e informe o número do
          pedido.
        </p>
      </main>
    </div>
  );
}
