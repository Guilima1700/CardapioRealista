import { Matrix4, Quaternion, Vector3 } from "three";
import { createHash } from "node:crypto";
import { AppError } from "./validation";
export const MAX_ASSET_BYTES = 30 * 1024 * 1024;
type Gltf = Record<string, any>;
function fail(message: string): never {
  throw new AppError(message);
}
function decodeDataUri(uri: unknown) {
  if (typeof uri !== "string" || !/^data:[^,]*;base64,/.test(uri))
    fail(
      "O GLTF deve ser autocontido. Inclua buffers/texturas em base64 ou exporte um GLB.",
    );
  const encoded = uri.slice(uri.indexOf(",") + 1);
  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(encoded))
    fail("Recurso base64 inválido no modelo.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_ASSET_BYTES)
    fail("Um recurso do modelo excede 30 MB.");
  return bytes;
}
function unpack(bytes: Buffer, extension: string): { doc: Gltf; bin?: Buffer } {
  if (extension === ".gltf") {
    try {
      return { doc: JSON.parse(bytes.toString("utf8")) };
    } catch {
      return fail("O GLTF não contém JSON válido.");
    }
  }
  if (
    bytes.length < 20 ||
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    fail("GLB inválido: cabeçalho, versão ou tamanho inconsistentes.");
  let offset = 12,
    doc: Gltf | undefined,
    bin: Buffer | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail("Bloco GLB incompleto.");
    const length = bytes.readUInt32LE(offset),
      type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length)
      fail("Tamanho de bloco GLB inválido.");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      if (doc || offset !== 12)
        fail("O primeiro bloco GLB deve ser JSON único.");
      try {
        doc = JSON.parse(chunk.toString("utf8").replace(/\0+$/, "").trim());
      } catch {
        fail("JSON inválido no GLB.");
      }
    } else if (type === 0x004e4942) {
      if (bin) fail("Bloco binário GLB duplicado.");
      bin = chunk;
    }
    offset += length + 8;
  }
  if (!doc) fail("O GLB não contém a descrição da cena.");
  return { doc, bin };
}
function pack(doc: Gltf, sourceBin?: Buffer) {
  if (doc?.asset?.version !== "2.0") fail("Use um modelo glTF 2.0.");
  if ((doc.nodes?.length || 0) > 50000)
    fail("Modelo muito complexo. Otimize a malha antes de enviar.");
  const chunks: Buffer[] = [],
    bases: number[] = [];
  let length = 0;
  function append(bytes: Buffer) {
    const start = length;
    chunks.push(bytes);
    length += bytes.length;
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      length += padding;
    }
    if (length > MAX_ASSET_BYTES) fail("O modelo normalizado excede 30 MB.");
    return start;
  }
  const buffers = doc.buffers || [];
  for (const [i, buffer] of buffers.entries()) {
    const bytes = buffer.uri
      ? decodeDataUri(buffer.uri)
      : i === 0 && sourceBin
        ? sourceBin
        : fail("Buffer ausente no modelo.");
    if (
      !Number.isInteger(buffer.byteLength) ||
      buffer.byteLength < 0 ||
      buffer.byteLength > bytes.length
    )
      fail("Tamanho de buffer inválido.");
    bases[i] = append(bytes.subarray(0, buffer.byteLength));
  }
  for (const view of doc.bufferViews || []) {
    const buffer = buffers[view.buffer];
    const offset = view.byteOffset || 0;
    if (
      !buffer ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(view.byteLength) ||
      view.byteLength < 0 ||
      offset + view.byteLength > buffer.byteLength
    )
      fail("BufferView fora dos limites do arquivo.");
    view.byteOffset = bases[view.buffer] + offset;
    view.buffer = 0;
  }
  for (const img of doc.images || []) {
    if (!img.uri) continue;
    const mime = /^data:([^;,]+)/.exec(img.uri)?.[1];
    if (
      !mime ||
      !["image/png", "image/jpeg", "image/webp", "image/ktx2"].includes(mime)
    )
      fail("Formato de textura não suportado. Use PNG, JPG, WebP ou KTX2.");
    const bytes = decodeDataUri(img.uri),
      byteOffset = append(bytes);
    doc.bufferViews ||= [];
    img.bufferView = doc.bufferViews.length;
    doc.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
    img.mimeType = mime;
    delete img.uri;
  }
  doc.buffers = [{ byteLength: length }];
  return Buffer.concat(chunks);
}
function normalizeScene(doc: Gltf, binary: Buffer, widthCm?: number) {
  const scene = doc.scenes?.[doc.scene ?? 0];
  if (!scene || !Array.isArray(scene.nodes) || !scene.nodes.length)
    fail("O modelo não contém uma cena visível.");
  let traversals = 0,
    vertices = 0;
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity);
  const position = new Vector3(),
    rotation = new Quaternion(),
    scale = new Vector3();
  function visit(index: number, parent: Matrix4, ancestors: Set<number>) {
    if (++traversals > 100000 || ancestors.size > 128 || ancestors.has(index))
      fail("Hierarquia de cena inválida ou excessiva.");
    const node = doc.nodes?.[index];
    if (!node) fail("A cena referencia um nó inexistente.");
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          position.fromArray(node.translation || [0, 0, 0]),
          rotation.fromArray(node.rotation || [0, 0, 0, 1]),
          scale.fromArray(node.scale || [1, 1, 1]),
        );
    if (!local.elements.every(Number.isFinite))
      fail("Transformação inválida no modelo.");
    const matrix = parent.clone().multiply(local);
    if (node.extensions?.EXT_mesh_gpu_instancing)
      fail("Exporte as instâncias como malhas antes de calibrar este arquivo.");
    if (node.mesh !== undefined) {
      for (const primitive of doc.meshes?.[node.mesh]?.primitives || []) {
        const accessor = doc.accessors?.[primitive.attributes?.POSITION];
        if (
          !accessor ||
          accessor.type !== "VEC3" ||
          !accessor.min ||
          !accessor.max ||
          !Number.isInteger(accessor.count) ||
          accessor.count <= 0
        )
          fail(
            "A malha precisa de posições e limites válidos (POSITION min/max).",
          );
        if (
          [...accessor.min, ...accessor.max].length !== 6 ||
          ![...accessor.min, ...accessor.max].every(Number.isFinite) ||
          accessor.min.some((v: number, i: number) => v > accessor.max[i])
        )
          fail("Limites geométricos inválidos.");
        vertices += accessor.count;
        if (vertices > 5000000)
          fail(
            "Modelo muito pesado. Reduza para menos de 5 milhões de vértices.",
          );
        const view = doc.bufferViews?.[accessor.bufferView];
        // A transformed accessor AABB overestimates rotated meshes. Measure
        // vertices so the physical width is also correct in native AR viewers.
        if (
          view &&
          !accessor.sparse &&
          !view.extensions?.EXT_meshopt_compression &&
          !primitive.extensions?.KHR_draco_mesh_compression
        ) {
          const sizes: Record<number, number> = {
            5120: 1,
            5121: 1,
            5122: 2,
            5123: 2,
            5125: 4,
            5126: 4,
          };
          const size = sizes[accessor.componentType],
            stride = view.byteStride || size * 3,
            start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
          if (
            !size ||
            !Number.isInteger(stride) ||
            stride < size * 3 ||
            !Number.isInteger(start) ||
            start < 0 ||
            start + (accessor.count - 1) * stride + size * 3 >
              (view.byteOffset || 0) + view.byteLength
          )
            fail("Posições fora dos limites do arquivo.");
          const read = (offset: number) => {
            let value =
              accessor.componentType === 5126
                ? binary.readFloatLE(offset)
                : accessor.componentType === 5125
                  ? binary.readUInt32LE(offset)
                  : accessor.componentType === 5123
                    ? binary.readUInt16LE(offset)
                    : accessor.componentType === 5122
                      ? binary.readInt16LE(offset)
                      : accessor.componentType === 5121
                        ? binary.readUInt8(offset)
                        : binary.readInt8(offset);
            if (accessor.normalized && accessor.componentType !== 5126)
              value =
                accessor.componentType === 5120
                  ? Math.max(value / 127, -1)
                  : accessor.componentType === 5122
                    ? Math.max(value / 32767, -1)
                    : value /
                      (accessor.componentType === 5121
                        ? 255
                        : accessor.componentType === 5123
                          ? 65535
                          : 4294967295);
            return value;
          };
          const point = new Vector3();
          for (let vertex = 0; vertex < accessor.count; vertex++) {
            const offset = start + vertex * stride;
            point
              .set(read(offset), read(offset + size), read(offset + size * 2))
              .applyMatrix4(matrix);
            if (![point.x, point.y, point.z].every(Number.isFinite))
              fail("Posição não finita no modelo.");
            min.min(point);
            max.max(point);
          }
        } else {
          if (widthCm !== undefined)
            fail(
              "Para calibrar a largura, exporte posições sem Draco, Meshopt ou sparse. Você pode enviar o arquivo já calibrado em metros sem preencher a largura.",
            );
          for (let corner = 0; corner < 8; corner++) {
            const point = new Vector3(
              ...([0, 1, 2].map((i) =>
                corner & (1 << i) ? accessor.max[i] : accessor.min[i],
              ) as [number, number, number]),
            ).applyMatrix4(matrix);
            min.min(point);
            max.max(point);
          }
        }
      }
    }
    const branch = new Set(ancestors);
    branch.add(index);
    for (const child of node.children || []) visit(child, matrix, branch);
  }
  for (const index of scene.nodes) visit(index, new Matrix4(), new Set());
  const size = max.clone().sub(min);
  if (
    !vertices ||
    ![size.x, size.y, size.z].every(Number.isFinite) ||
    size.x <= 0 ||
    size.z <= 0
  )
    fail("Não encontramos geometria tridimensional válida no arquivo.");
  if (
    widthCm !== undefined &&
    (!Number.isFinite(widthCm) || widthCm < 1 || widthCm > 200)
  )
    fail("Informe uma largura real entre 1 e 200 cm.");
  const factor = widthCm === undefined ? 1 : widthCm / 100 / size.x;
  const root = doc.nodes.length;
  doc.nodes.push({
    name: "Brasa · origem na base e escala física",
    children: [...scene.nodes],
    scale: [factor, factor, factor],
    translation: [
      (-(min.x + max.x) / 2) * factor,
      -min.y * factor,
      (-(min.z + max.z) / 2) * factor,
    ],
  });
  scene.nodes = [root];
  return {
    widthCm: size.x * factor * 100,
    heightCm: size.y * factor * 100,
    depthCm: size.z * factor * 100,
  };
}
export function encodeGlb(doc: Gltf, bin: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(doc)),
    jsonPadding = (4 - (json.length % 4)) % 4,
    binPadding = (4 - (bin.length % 4)) % 4;
  const output = Buffer.alloc(
    12 + 8 + json.length + jsonPadding + 8 + bin.length + binPadding,
  );
  output.write("glTF");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length + jsonPadding, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  output.fill(0x20, 20 + json.length, 20 + json.length + jsonPadding);
  const offset = 20 + json.length + jsonPadding;
  output.writeUInt32LE(bin.length + binPadding, offset);
  output.writeUInt32LE(0x004e4942, offset + 4);
  bin.copy(output, offset + 8);
  return output;
}
export function prepareAsset(
  bytes: Buffer,
  filename: string,
  widthCm?: number,
) {
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES)
    fail("Envie um arquivo de até 30 MB.");
  let extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  let dimensions:
    { widthCm: number; heightCm: number; depthCm: number } | undefined;
  if (extension === ".glb" || extension === ".gltf") {
    const { doc, bin } = unpack(bytes, extension);
    const packed = pack(doc, bin);
    dimensions = normalizeScene(doc, packed, widthCm);
    bytes = encodeGlb(doc, packed);
    extension = ".glb";
    if (bytes.length > MAX_ASSET_BYTES)
      fail("O modelo normalizado excede 30 MB.");
  } else {
    const valid =
      extension === ".usdz"
        ? bytes[0] === 0x50 &&
          bytes[1] === 0x4b &&
          bytes.includes(Buffer.from(".usd"))
        : extension === ".png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : extension === ".webp"
            ? bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP"
            : [".jpg", ".jpeg"].includes(extension)
              ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
              : false;
    if (!valid)
      fail(
        "Arquivo inválido. Use GLB, GLTF autocontido, USDZ, JPG, PNG ou WebP.",
      );
  }
  const mime = {
    ".glb": "model/gltf-binary",
    ".usdz": "model/vnd.usdz+zip",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  }[extension]!;
  return {
    bytes,
    extension,
    mime,
    dimensions,
    kind: (extension === ".glb"
      ? "model"
      : extension === ".usdz"
        ? "usdz"
        : "image") as "model" | "usdz" | "image",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
