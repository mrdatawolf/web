import type { DeviceOutput } from "../../types.ts";

export const fromDeviceStream: () => TransformStream<Uint8Array, DeviceOutput> = (
  // onReleaseEvent: SimpleEventDispatcher<boolean>,
) => {
  let byteBuffer = new Uint8Array([]);
  const textDecoder = new TextDecoder();
  return new TransformStream<Uint8Array, DeviceOutput>({
    transform(chunk: Uint8Array, controller): void {
      byteBuffer = new Uint8Array([...byteBuffer, ...chunk]);

      while (byteBuffer.length !== 0) {
        const framingIndex = byteBuffer.indexOf(0x94);

        // No framing byte in buffer — discard everything as non-packet data
        if (framingIndex === -1) {
          controller.enqueue({
            type: "debug",
            data: textDecoder.decode(byteBuffer),
          });
          byteBuffer = new Uint8Array([]);
          break;
        }

        // Emit any bytes before the framing byte as debug data
        if (framingIndex > 0) {
          controller.enqueue({
            type: "debug",
            data: textDecoder.decode(byteBuffer.subarray(0, framingIndex)),
          });
          byteBuffer = byteBuffer.subarray(framingIndex);
        }

        // Need at least 2 bytes to check the second framing byte
        if (byteBuffer.length < 2) {
          break;
        }

        const framingByte2 = byteBuffer[1];

        if (framingByte2 !== 0xc3) {
          // False-start: 0x94 not followed by 0xC3 — skip this byte and keep searching
          byteBuffer = byteBuffer.subarray(1);
          continue;
        }

        // Valid frame header found: 0x94 0xC3 MSB LSB [payload]
        // Need at least 4 bytes for the header
        if (byteBuffer.length < 4) {
          break;
        }

        const msb = byteBuffer[2];
        const lsb = byteBuffer[3];
        const packetLength = (msb << 8) + lsb;

        if (byteBuffer.length < 4 + packetLength) {
          // Partial message in buffer — wait for the rest
          break;
        }

        const packet = byteBuffer.subarray(4, 4 + packetLength);
        byteBuffer = byteBuffer.subarray(4 + packetLength);

        controller.enqueue({
          type: "packet",
          data: packet,
        });
      }
    },
  });
};
