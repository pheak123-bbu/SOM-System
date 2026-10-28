import QRCode from "qrcode";
import { generateBakongKHQRString } from "./cambodia";

export async function generateKHQRDataURL(params: {
  bakongAccountId?: string;
  merchantName?: string;
  amountUSD: number;
  orderNumber: string;
}): Promise<string> {
  const khqrPayload = generateBakongKHQRString({
    bakongAccountId: params.bakongAccountId || "seller_som@aba",
    merchantName: params.merchantName || "SOM Store",
    amountUSD: params.amountUSD,
    orderNumber: params.orderNumber,
  });

  return QRCode.toDataURL(khqrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: {
      dark: "#142c68", // using our signature Cambodian navy blue theme!
      light: "#ffffff",
    },
  });
}
