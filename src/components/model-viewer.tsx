"use client";
import { createElement, useEffect, useRef, useState } from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import {
  Box,
  Maximize,
  Rotate3D,
  Smartphone,
  AlertCircle,
  RotateCcw,
  ScanLine,
  Check,
  Move3D,
  X,
} from "lucide-react";
import { track } from "@/lib/client";
import { hasProductAR, presentationOf } from "@/lib/product-media";
import type { Product } from "@/lib/types";
export type ModelMeasurement = {
  widthCm: number;
  heightCm: number;
  depthCm: number;
};
export default function ModelViewer({
  product,
  preview = false,
  onReady,
}: {
  product: Product;
  preview?: boolean;
  onReady?: (dimensions: ModelMeasurement) => void;
}) {
  const element = useRef<ModelViewerElement | null>(null),
    container = useRef<HTMLDivElement>(null),
    callback = useRef(onReady);
  callback.current = onReady;
  const config = presentationOf(product),
    enabledAR = hasProductAR(product);
  const enabledARRef = useRef(enabledAR);
  const [ready, setReady] = useState(false),
    [capable, setCapable] = useState(false),
    [secure, setSecure] = useState(true),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [attempt, setAttempt] = useState(0),
    [paused, setPaused] = useState(false),
    [dimensions, setDimensions] = useState<ModelMeasurement | null>(null),
    [arStatus, setArStatus] = useState("not-presenting"),
    [tracking, setTracking] = useState("tracking");
  const initialOrbit = `${config.cameraTheta}deg ${config.cameraPhi}deg ${config.cameraRadius}%`;
  // AR metadata changes do not reload the GLB or restart its camera/loading state.
  // The existing event listeners and capability poll read the latest setting.
  useEffect(() => {
    enabledARRef.current = enabledAR;
    setCapable(
      enabledAR && window.isSecureContext && !!element.current?.canActivateAR,
    );
  }, [enabledAR, product.usdzUrl]);
  useEffect(() => {
    let disposed = false,
      cleanup = () => {};
    setReady(false);
    setProgress(0);
    setError("");
    setCapable(false);
    setDimensions(null);
    setPaused(false);
    setArStatus("not-presenting");
    setSecure(window.isSecureContext);
    import("@google/model-viewer")
      .then(() => {
        if (disposed) return;
        const el = element.current;
        if (!el) return;
        let reported = false;
        const capability = () => {
          if (!disposed)
            setCapable(
              enabledARRef.current &&
                window.isSecureContext &&
                el.canActivateAR,
            );
        };
        const loaded = () => {
          if (disposed || reported) return;
          reported = true;
          setReady(true);
          setProgress(1);
          capability();
          const size = el.getDimensions();
          const measured = {
            widthCm: size.x * 100,
            heightCm: size.y * 100,
            depthCm: size.z * 100,
          };
          setDimensions(measured);
          callback.current?.(measured);
          if (!preview) track("model_view", product.id);
        };
        const failed = () => {
          if (!disposed) {
            setError(
              "Não foi possível carregar este modelo. Tente novamente ou continue pela fotografia.",
            );
            setReady(false);
            setCapable(false);
          }
        };
        const loading = (event: Event) => {
          if (!disposed)
            setProgress(
              Math.max(
                0,
                Math.min(1, (event as CustomEvent).detail.totalProgress || 0),
              ),
            );
        };
        const status = (event: Event) => {
          if (disposed) return;
          const value = (event as CustomEvent).detail.status;
          setArStatus(value);
          if (value === "failed")
            setError(
              "A experiência AR não pôde iniciar. Verifique a permissão da câmera ou use o modelo 3D.",
            );
          capability();
        };
        const trackStatus = (event: Event) => {
          if (!disposed) setTracking((event as CustomEvent).detail.status);
        };
        const camera = (event: Event) => {
          if ((event as CustomEvent).detail?.source === "user-interaction")
            setPaused(true);
        };
        el.addEventListener("load", loaded);
        el.addEventListener("error", failed);
        el.addEventListener("progress", loading);
        el.addEventListener("ar-status", status);
        el.addEventListener("ar-tracking", trackStatus);
        el.addEventListener("camera-change", camera);
        window.addEventListener("focus", capability);
        const timer = setInterval(capability, 2000);
        capability();
        if (el.loaded) loaded();
        cleanup = () => {
          clearInterval(timer);
          window.removeEventListener("focus", capability);
          el.removeEventListener("load", loaded);
          el.removeEventListener("error", failed);
          el.removeEventListener("progress", loading);
          el.removeEventListener("ar-status", status);
          el.removeEventListener("ar-tracking", trackStatus);
          el.removeEventListener("camera-change", camera);
        };
      })
      .catch(() => {
        if (!disposed)
          setError(
            "O visualizador não pôde ser iniciado. A fotografia e o pedido continuam disponíveis.",
          );
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [product.id, product.modelUrl, attempt, preview]);
  function reset() {
    const el = element.current;
    if (!el) return;
    el.cameraOrbit = initialOrbit;
    el.cameraTarget = "auto auto auto";
    el.fieldOfView = "30deg";
    el.jumpCameraToGoal();
    setPaused(false);
  }
  async function activate() {
    const el = element.current;
    if (!ready || !enabledAR || !el?.canActivateAR || !window.isSecureContext) {
      setCapable(false);
      return;
    }
    setError("");
    setArStatus("launching");
    try {
      await el.activateAR();
      if (!preview) track("ar_start", product.id);
      setArStatus((current) =>
        current === "launching" ? "not-presenting" : current,
      );
    } catch {
      setArStatus("not-presenting");
      setError(
        "Não foi possível iniciar AR. Você pode continuar em 3D; a câmera só é acessada pelo visualizador compatível.",
      );
    }
  }
  return (
    <div
      ref={container}
      className={`viewer-wrap viewer-premium ${preview ? "viewer-preview" : ""}`}
      data-model-state={error && !ready ? "error" : ready ? "ready" : "loading"}
    >
      <div className="viewer-top">
        <span>
          <Box size={15} />
          {preview ? "PRÉVIA ANTES DE PUBLICAR" : "CADA ÂNGULO, UM NOVO SABOR"}
        </span>
        <div className="viewer-tools">
          <button
            type="button"
            className="icon-button"
            disabled={!ready}
            onClick={reset}
            aria-label="Restaurar enquadramento"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={!ready}
            aria-label="Abrir modelo em tela cheia"
            onClick={() => {
              const target = container.current;
              if (!target?.requestFullscreen) {
                setError("Use o gesto de pinça para ampliar neste navegador.");
                return;
              }
              void target
                .requestFullscreen()
                .catch(() =>
                  setError(
                    "Tela cheia indisponível. Use o gesto de pinça para ampliar.",
                  ),
                );
            }}
          >
            <Maximize size={17} />
          </button>
        </div>
      </div>
      <div className="viewer-stage" aria-busy={!ready && !error}>
        {createElement(
          "model-viewer",
          {
            key: attempt,
            ref: element,
            src: product.modelUrl,
            "ios-src":
              enabledAR && secure ? product.usdzUrl || undefined : undefined,
            poster: product.image || undefined,
            alt: `Modelo 3D de ${product.name}`,
            "camera-controls": "",
            "auto-rotate": config.autoRotate && !paused ? "" : undefined,
            "auto-rotate-delay": "3500",
            "rotation-per-second": "10deg",
            ar: enabledAR && secure,
            "ar-modes": "webxr scene-viewer quick-look",
            "ar-scale": config.arScale,
            "ar-placement": "floor",
            "xr-environment": "",
            "shadow-intensity": "1.15",
            "shadow-softness": "1",
            "environment-image": "neutral",
            exposure: String(config.exposure),
            "tone-mapping": "neutral",
            "camera-orbit": initialOrbit,
            "camera-target": "auto auto auto",
            "field-of-view": "30deg",
            "min-camera-orbit": "auto 5deg 45%",
            "max-camera-orbit": "auto 100deg 280%",
            "interaction-prompt": "auto",
            "interaction-prompt-style": "basic",
            "touch-action": "pan-y",
            loading: "eager",
            reveal: "auto",
            style: { display: "block", width: "100%", height: "100%" },
          },
          createElement("button", {
            type: "button",
            slot: "ar-button",
            style: { display: "none" },
            "aria-hidden": true,
            tabIndex: -1,
          }),
          createElement(
            "button",
            {
              type: "button",
              slot: "exit-webxr-ar-button",
              className: "ar-exit",
            },
            createElement(X, { size: 18 }),
            " Voltar ao cardápio",
          ),
          createElement(
            "div",
            { className: "ar-spatial-guide", "aria-live": "polite" },
            createElement(ScanLine, { size: 26 }),
            createElement(
              "span",
              null,
              tracking === "not-tracking"
                ? "Mova o celular devagar para reencontrar a superfície."
                : arStatus === "object-placed"
                  ? "Posicionado. Arraste para mover; use dois dedos para girar."
                  : "Aponte para uma mesa iluminada e mova o celular devagar.",
            ),
          ),
        )}
        {!ready && !error && (
          <div className="model-loading" role="status">
            <Box size={29} />
            <strong>Preparando cada detalhe…</strong>
            <span>{Math.round(progress * 100)}%</span>
            <div
              role="progressbar"
              aria-label="Carregando modelo 3D"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <i style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
        {error && !ready && (
          <div className="model-load-error" role="alert">
            <AlertCircle size={27} />
            <p>{error}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RotateCcw size={15} /> Tentar novamente
            </button>
          </div>
        )}
        {ready && (
          <div className="model-dimensions">
            <Check size={12} />
            {dimensions
              ? `${dimensions.widthCm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm de largura`
              : "Modelo carregado"}
          </div>
        )}
      </div>
      <div className="viewer-hint">
        <Rotate3D size={15} />
        Arraste para girar · Aproxime com dois dedos
      </div>
      {enabledAR && (
        <>
          <button
            type="button"
            className="button primary full ar-main-button"
            disabled={!ready || !capable || arStatus === "launching"}
            onClick={() => void activate()}
          >
            <Smartphone size={18} /> Ver na minha mesa <Move3D size={17} />
          </button>
          <p className="ar-capability-message" role="status">
            {!ready
              ? "O botão fica disponível após carregar o prato."
              : !secure
                ? "AR precisa de HTTPS. Você pode explorar o prato em 3D aqui."
                : !capable
                  ? "AR não está disponível neste aparelho ou navegador. Explore o modelo em 3D."
                  : config.arScale === "fixed"
                    ? "Posicione, mova e gire na mesa. Escala física preservada."
                    : "Posicione, mova, gire e ajuste o tamanho pelos gestos do visualizador."}
          </p>
        </>
      )}
      {!enabledAR && ready && (
        <p className="ar-capability-message">
          Visualização 3D disponível. A realidade aumentada está desativada para
          este produto.
        </p>
      )}
      {error && ready && (
        <p className="notice error" role="alert">
          <AlertCircle size={15} />
          {error}
        </p>
      )}
      {product.modelCredit && (
        <p className="model-credit">{product.modelCredit}</p>
      )}
    </div>
  );
}
