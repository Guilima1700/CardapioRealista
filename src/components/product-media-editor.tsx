"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Upload,
  Trash2,
  Eye,
  CheckCircle2,
  Image as ImageIcon,
  Archive,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  defaultPresentation,
  hasModel3d,
  presentationOf,
} from "@/lib/product-media";
import type { Product, ProductAsset } from "@/lib/types";
const ModelViewer = dynamic(() => import("./model-viewer"), {
  ssr: false,
  loading: () => <div className="viewer-loading">Preparando prévia 3D…</div>,
});
export default function ProductMediaEditor({
  product: p,
  onChange,
  onBusy,
  onVerified,
}: {
  product: Product;
  onChange: (product: Product) => void;
  onBusy: (busy: boolean) => void;
  onVerified: (url: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState(p.modelUrl || ""),
    [width, setWidth] = useState(""),
    [assets, setAssets] = useState<ProductAsset[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [uploading, setUploading] = useState<string | null>(null);
  const settings = presentationOf(p);
  const load = useCallback(async () => {
    try {
      setAssets(
        await api<ProductAsset[]>(
          `/api/assets?productId=${encodeURIComponent(p.id)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [p.id]);
  useEffect(() => {
    void load();
  }, [load]);
  function config(
    key: keyof typeof settings,
    value: number | boolean | string,
  ) {
    onChange({ ...p, modelPresentation: { ...settings, [key]: value } });
  }
  async function upload(
    file: File | undefined,
    field: "image" | "modelUrl" | "usdzUrl",
  ) {
    if (!file) return;
    setUploading(field);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("productId", p.id);
      form.set("productName", p.name || p.id);
      if (field === "modelUrl" && width) form.set("widthCm", width);
      const asset = await api<ProductAsset>("/api/uploads", {
        method: "POST",
        body: form,
      });
      const expected =
        field === "image" ? "image" : field === "modelUrl" ? "model" : "usdz";
      if (asset.kind !== expected)
        throw new Error("O arquivo não corresponde ao campo selecionado.");
      onChange({
        ...p,
        [field]: asset.url,
        [field === "image"
          ? "imageAssetId"
          : field === "modelUrl"
            ? "modelAssetId"
            : "usdzAssetId"]: asset.id,
        ...(field === "modelUrl"
          ? {
              model3dEnabled: p.model3dEnabled ?? true,
              arEnabled: p.arEnabled ?? true,
              modelPresentation: p.modelPresentation || defaultPresentation,
            }
          : {}),
      });
      if (field === "modelUrl") setPreviewUrl(asset.url);
      setMessage(
        field === "modelUrl" && asset.dimensions
          ? `Modelo enviado e calibrado: ${asset.dimensions.widthCm.toFixed(1)} × ${asset.dimensions.depthCm.toFixed(1)} × ${asset.dimensions.heightCm.toFixed(1)} cm. Confira a prévia e salve o produto.`
          : "Arquivo enviado. Salve o produto para publicar a associação.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
      onBusy(false);
    }
  }
  async function archive(asset: ProductAsset) {
    setUploading(asset.id);
    onBusy(true);
    setError("");
    try {
      await api(`/api/assets/${asset.id}`, { method: "DELETE" });
      setMessage("Arquivo arquivado no acervo. O original foi preservado.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
      onBusy(false);
    }
  }
  return (
    <section className="product-media-manager">
      <div className="media-editor-grid">
        <div className="media-fields">
          <div className="media-section-heading">
            <Box size={22} />
            <div>
              <h3>Um prato. Todos os ângulos.</h3>
              <p>Prepare, confira e publique a experiência do produto.</p>
            </div>
          </div>
          {(
            [
              ["image", "Fotografia", "image/jpeg,image/png,image/webp"],
              ["modelUrl", "Modelo 3D", ".glb,.gltf"],
              ["usdzUrl", "USDZ para iPhone / iPad (opcional)", ".usdz"],
            ] as const
          ).map(([field, label, accept]) => (
            <div className="media-upload-field" key={field}>
              <label>
                {label}
                <input
                  aria-label={label}
                  value={p[field] || ""}
                  onChange={(e) =>
                    onChange({
                      ...p,
                      [field]: e.target.value,
                      [field === "image"
                        ? "imageAssetId"
                        : field === "modelUrl"
                          ? "modelAssetId"
                          : "usdzAssetId"]: undefined,
                    })
                  }
                  placeholder="Envie um arquivo ou informe uma URL HTTPS"
                />
              </label>
              <div className="asset-field-actions">
                <label className="button secondary upload-label">
                  <Upload size={15} />
                  {uploading === field ? "Enviando…" : "Enviar arquivo"}
                  <input
                    type="file"
                    accept={accept}
                    disabled={!!uploading}
                    aria-label={`Enviar ${label}`}
                    onChange={(e) => {
                      void upload(e.target.files?.[0], field);
                      e.target.value = "";
                    }}
                  />
                </label>
                {field !== "image" && p[field] && (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={!!uploading}
                    onClick={() => {
                      onChange({
                        ...p,
                        [field]: "",
                        [field === "modelUrl" ? "modelAssetId" : "usdzAssetId"]:
                          undefined,
                        ...(field === "modelUrl"
                          ? {
                              model3dEnabled: false,
                              arEnabled: false,
                              usdzUrl: "",
                              usdzAssetId: undefined,
                            }
                          : {}),
                      });
                      if (field === "modelUrl") setPreviewUrl("");
                    }}
                  >
                    <Trash2 size={14} />
                    Remover associação
                  </button>
                )}
              </div>
            </div>
          ))}
          <label className="real-width-label">
            Largura real ao enviar o modelo (cm)
            <input
              type="number"
              min={1}
              max={200}
              step="0.1"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="Ex.: 14 para o burger, 27 para um prato"
            />
            <small>
              Aplicada ao arquivo GLB no próximo upload, inclusive no Android e
              iOS. Sem valor, preservamos os metros do modelo.
            </small>
          </label>
          <div className="media-publication-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hasModel3d(p)}
                disabled={!p.modelUrl}
                onChange={(e) =>
                  onChange({
                    ...p,
                    model3dEnabled: e.target.checked,
                    arEnabled: e.target.checked ? (p.arEnabled ?? true) : false,
                  })
                }
              />
              Habilitar visualização 3D
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hasModel3d(p) && p.arEnabled !== false}
                disabled={!hasModel3d(p)}
                onChange={(e) =>
                  onChange({ ...p, arEnabled: e.target.checked })
                }
              />
              Habilitar “Ver na minha mesa”
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.arScale === "auto"}
                onChange={(e) =>
                  config("arScale", e.target.checked ? "auto" : "fixed")
                }
              />
              Permitir redimensionar em AR
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoRotate}
                onChange={(e) => config("autoRotate", e.target.checked)}
              />
              Rotação suave antes do primeiro gesto
            </label>
          </div>
          <fieldset className="media-camera-settings">
            <legend>Apresentação e câmera</legend>
            {(
              [
                ["cameraTheta", "Ângulo lateral", -180, 180, 1, "°"],
                ["cameraPhi", "Inclinação", 15, 90, 1, "°"],
                ["cameraRadius", "Enquadramento", 70, 180, 1, "%"],
                ["exposure", "Iluminação", 0.4, 2, 0.1, "×"],
              ] as const
            ).map(([key, label, min, max, step, unit]) => (
              <label key={key}>
                {label}
                <span>
                  {settings[key]}
                  {unit}
                </span>
                <input
                  type="range"
                  aria-label={label}
                  min={min}
                  max={max}
                  step={step}
                  value={settings[key]}
                  onChange={(e) => config(key, Number(e.target.value))}
                />
              </label>
            ))}
          </fieldset>
          <label className="media-credit-label">
            Créditos e apresentação do modelo
            <input
              maxLength={500}
              value={p.modelCredit || ""}
              onChange={(e) => onChange({ ...p, modelCredit: e.target.value })}
              placeholder="Autoria, licença e aviso de modelo ilustrativo, se aplicável"
            />
          </label>
          <p className="fine-print">
            GLB ou GLTF autocontido, até 30 MB. Texturas e buffers externos de
            um GLTF precisam ser incorporados antes do upload. USDZ deve usar as
            mesmas dimensões do GLB. A qualidade visual depende do modelo
            produzido; fotografias não são convertidas automaticamente.
          </p>
        </div>
        <div className="media-preview">
          <div className="preview-heading">
            <span>
              <Eye size={16} /> PRÉVIA DO CLIENTE
            </span>
            {previewUrl && (
              <button
                type="button"
                className="text-link"
                disabled={!!uploading}
                onClick={() => setPreviewUrl(p.modelUrl || "")}
              >
                <RefreshCw size={13} />
                Carregar prévia
              </button>
            )}
          </div>
          {previewUrl ? (
            <ModelViewer
              product={{ ...p, modelUrl: previewUrl, model3dEnabled: true }}
              preview
              onReady={() => onVerified(previewUrl)}
            />
          ) : (
            <div className="media-preview-empty">
              <Box size={46} />
              <h3>Seu próximo prato em 3D</h3>
              <p>
                Envie um modelo para conferir cada detalhe antes de publicá-lo.
              </p>
              {p.modelUrl && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setPreviewUrl(p.modelUrl!)}
                >
                  Carregar prévia
                </button>
              )}
            </div>
          )}
          {p.image && (
            <div className="media-photo-preview">
              <img src={p.image} alt={`Prévia da foto de ${p.name}`} />
              <span>
                <ImageIcon size={13} />
                Fotografia do produto
              </span>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          <CheckCircle2 size={16} />
          {message}
        </p>
      )}
      {assets.length > 0 && (
        <div className="media-library">
          <h3>
            Arquivos deste produto <small>{assets.length}</small>
          </h3>
          <p>
            Substituir ou remover uma associação preserva os originais. Arquive
            arquivos sem uso para organizar o acervo.
          </p>
          {assets.map((asset) => (
            <div className="media-library-row" key={asset.id}>
              <span className="media-file-icon">
                {asset.kind === "image" ? (
                  <ImageIcon size={18} />
                ) : (
                  <Box size={18} />
                )}
              </span>
              <div>
                <b>{asset.originalName}</b>
                <small>
                  {(asset.bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
                  {asset.kind.toUpperCase()}
                  {asset.dimensions
                    ? ` · ${asset.dimensions.widthCm.toFixed(1)} cm`
                    : ""}
                </small>
              </div>
              {[p.image, p.modelUrl, p.usdzUrl].includes(asset.url) ? (
                <span className="status-badge confirmed">Associado</span>
              ) : (
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!uploading}
                  onClick={() =>
                    onChange({
                      ...p,
                      ...(asset.kind === "model"
                        ? {
                            modelUrl: asset.url,
                            modelAssetId: asset.id,
                            model3dEnabled: true,
                            arEnabled: true,
                          }
                        : asset.kind === "usdz"
                          ? { usdzUrl: asset.url, usdzAssetId: asset.id }
                          : { image: asset.url, imageAssetId: asset.id }),
                    })
                  }
                >
                  <CheckCircle2 size={14} />
                  Usar
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`Arquivar ${asset.originalName}`}
                disabled={
                  !!uploading ||
                  [p.image, p.modelUrl, p.usdzUrl].includes(asset.url)
                }
                onClick={() => void archive(asset)}
              >
                <Archive size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
