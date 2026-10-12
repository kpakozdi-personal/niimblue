import { OBJECT_DEFAULTS_TEXT } from "$/defaults";

export class CanvasDraw {
  static equalSpacingFillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, printWidth: number) {
    // calculate every character width, and spacing
    const widths = [];
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      const metrics = ctx.measureText(char);
      widths.push(metrics.width);
    }
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const spacing = (printWidth - totalWidth) / (text.length - 1);

    // print every character with calculated spacing
    let offset = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      ctx.fillText(char, x + offset, y);
      offset += widths[i] + spacing;
    }
  }

  static renderError(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.fillStyle = "black";
    ctx.translate(-width / 2, -height / 2); // make top-left origin
    ctx.translate(-0.5, -0.5); // blurry rendering fix
    ctx.fillRect(0, 0, width + 1, height + 1);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = `16px ${OBJECT_DEFAULTS_TEXT.fontFamily}`;
    ctx.fillText("ERR", 0, 0);
    ctx.restore();
  }
}
