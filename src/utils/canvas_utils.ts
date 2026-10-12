import * as fabric from "fabric";
import ArUcoMarker from "$/fabric-object/aruco";
import Barcode from "$/fabric-object/barcode";
import QRCode from "$/fabric-object/qrcode";

export class CanvasUtils {
  static fixFabricObjectScale(obj: fabric.FabricObject) {
    const isNotScalable = obj instanceof Barcode || obj instanceof fabric.Rect || obj instanceof QRCode || obj instanceof ArUcoMarker;

    if (isNotScalable) {
      obj.set({
        width: Math.round(obj.width * (obj.scaleX ?? 1)),
        height: Math.round(obj.height * (obj.scaleY ?? 1)),
        scaleX: 1,
        scaleY: 1,
        left: Math.round(obj.left),
        top: Math.round(obj.top),
      });

      if (obj instanceof QRCode || obj instanceof ArUcoMarker) {
        const qrMin = 42;
        const size = Math.max(obj.width + (obj.width % 2), qrMin);
        obj.set({
          width: size,
          height: size,
        });
      }
    }
  }

  static fitObjectIntoCanvas(canvas: fabric.Canvas, obj: fabric.FabricObject, xMargin: number, yMarin: number) {
    const widthRatio = canvas.width / (obj.width + xMargin * 2);
    const heightRatio = canvas.height / (obj.height + yMarin * 2);
    const scaleFactor = Math.min(widthRatio, heightRatio);
    obj.set({ left: xMargin, top: yMarin });
    obj.scale(scaleFactor);
    canvas.centerObjectV(obj);
    canvas.centerObjectH(obj);
  }
}
