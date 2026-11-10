import type { ModelPresentation, Product } from "./types";
export const defaultPresentation: ModelPresentation = {
  cameraTheta: 30,
  cameraPhi: 65,
  cameraRadius: 105,
  exposure: 1,
  autoRotate: true,
  arScale: "auto",
};
export function hasModel3d(
  product: Pick<Product, "modelUrl" | "model3dEnabled">,
) {
  return !!product.modelUrl && product.model3dEnabled !== false;
}
export function hasProductAR(product: Product) {
  return hasModel3d(product) && product.arEnabled !== false;
}
export function presentationOf(product: Product): ModelPresentation {
  return { ...defaultPresentation, ...product.modelPresentation };
}
