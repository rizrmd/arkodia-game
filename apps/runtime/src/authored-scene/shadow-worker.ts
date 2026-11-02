import {
  buildShadowField,
  type ShadowImage,
  type ShadowRequest,
} from "./shadow-field";
const images = new Map<number, ShadowImage>();
self.onmessage = ({ data }: { data: ShadowRequest }) => {
  try {
    const result = buildShadowField(data, images);
    self.postMessage(result, {
      transfer: [
        result.receiver.buffer,
        result.depth.buffer,
        result.second.buffer,
        result.groundShade.buffer,
      ],
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
